import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { FileError } from '@ddd-ts-kit/kernel';
import { describe, expect, it } from 'vitest';
import { S3FileStorage, s3ClientOf } from '../src';
import { uploadSettled } from '../src/upload-settled';

const client = s3ClientOf({
  endpoint: 'http://127.0.0.1:1',
  region: 'us-east-1',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
});

const storage = new S3FileStorage({ client, bucket: 'documents', prefix: 'app/' });
const MEBIBYTE = 1024 * 1024;

describe('S3FileStorage without a server', () => {
  it('signs a short download link for the key under its prefix, with the name to save under', async () => {
    const link = await storage.signedDownloadUrl('reports/march.pdf', {
      expiresInSeconds: 300,
      fileName: 'mars "2026".pdf',
    });

    const url = new URL(link.url);

    expect(url.pathname).toBe('/documents/app/reports/march.pdf');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');

    expect(url.searchParams.get('response-content-disposition')).toBe(
      `attachment; filename="mars _2026_.pdf"; filename*=UTF-8''mars%20%222026%22.pdf`,
    );
  });

  it('refuses a body that is no Node.js stream, which is what the browser build of the SDK answers', async () => {
    const browser = s3ClientOf({
      endpoint: 'http://127.0.0.1:1',
      region: 'us-east-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    browser.middlewareStack.add(
      () => () => Promise.resolve({ output: { Body: new Blob(['hello']).stream(), $metadata: {} }, response: {} }),
      { step: 'initialize' },
    );

    await expect(new S3FileStorage({ client: browser, bucket: 'documents' }).get('a.pdf')).rejects.toThrow(
      'not a Node.js stream',
    );
  });

  it('signs the key at the root of the bucket for a storage without a prefix', async () => {
    const link = await new S3FileStorage({ client, bucket: 'documents' }).signedDownloadUrl('reports/march.pdf', {
      expiresInSeconds: 300,
    });

    expect(new URL(link.url).pathname).toBe('/documents/reports/march.pdf');
  });

  it('signs a download link without a name as an attachment all the same', async () => {
    const link = await storage.signedDownloadUrl('reports/march.pdf', { expiresInSeconds: 300 });

    expect(new URL(link.url).searchParams.get('response-content-disposition')).toBe('attachment');
  });

  it('signs an upload link bound to its media type, with no checksum a client could not send', async () => {
    const upload = await storage.signedUploadUrl('staging/notes.txt', {
      expiresInSeconds: 60,
      mediaType: 'Text/Plain',
      maxBytes: 1_000,
    });

    const url = new URL(upload.url);

    expect(upload.headers).toEqual({ 'content-type': 'text/plain' });
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    expect([...url.searchParams.keys()].some((name) => name.toLowerCase().includes('checksum'))).toBe(false);
  });

  it('refuses a key, a prefix or an expiry the port does not allow, before any request', async () => {
    const codeOf = (work: Promise<unknown>) =>
      work.then(String, (error: unknown) => (FileError.is(error) ? error.code : String(error)));

    expect(await codeOf(storage.stat('../escape'))).toBe('INVALID_FILE_KEY');

    expect(await codeOf(storage.signedDownloadUrl('a.pdf', { expiresInSeconds: 7_200 }))).toBe(
      'INVALID_FILE_URL_EXPIRY',
    );

    expect(() => new S3FileStorage({ client, bucket: 'documents', prefix: 'no-slash' })).toThrow('ending with "/"');
    expect(() => new S3FileStorage({ client, bucket: 'documents', prefix: '../up/' })).toThrow('ending with "/"');
  });

  it('fails, rather than answering that nothing is there, when the server is away', async () => {
    await expect(storage.stat('reports/march.pdf')).rejects.toThrow();
    await expect(storage.get('reports/march.pdf')).rejects.toThrow();
  });

  it('rejects with the refusal of the content before the failure of the upload it cut', async () => {
    const refused = FileError.tooLarge(10);

    await expect(uploadSettled(Promise.reject(refused), Promise.reject(new Error('cut')))).rejects.toBe(refused);
    await expect(uploadSettled(Promise.resolve(), Promise.reject(new Error('cut')))).rejects.toThrow('cut');
    await expect(uploadSettled(Promise.resolve(), Promise.resolve('done'))).resolves.toBeUndefined();
  });

  it('rejects with the failure of the upload before the one of the stream it cut', async () => {
    const down = new Error('network down');

    await expect(uploadSettled(Promise.reject(new Error('aborted')), Promise.reject(down))).rejects.toBe(down);
    await expect(uploadSettled(Promise.reject(new Error('aborted')), Promise.resolve())).rejects.toThrow('aborted');
  });
});

/** A storage whose service fails every request the same way, as a network that is down does. */
function storageOfAServiceDown(): S3FileStorage {
  const down = new S3Client({
    region: 'us-east-1',
    maxAttempts: 1,
    credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
    requestHandler: { handle: () => Promise.reject(new Error('network down')) },
  });

  return new S3FileStorage({ client: down, bucket: 'documents', partSize: 5 * MEBIBYTE });
}

function contentOf(mebibytes: number): Readable {
  return Readable.from(Array.from({ length: mebibytes * 16 }, () => Buffer.alloc(MEBIBYTE / 16, 1)));
}

describe('S3FileStorage.put when the service fails', () => {
  const failureOf = (mebibytes: number, from: S3FileStorage = storageOfAServiceDown()) =>
    from.put('big.bin', contentOf(mebibytes), { mediaType: 'application/octet-stream' }).then(
      () => 'stored',
      (error: Error) => error.message,
    );

  it('says so whatever the size of the content, in one part or in several', async () => {
    expect([await failureOf(1), await failureOf(12)]).toEqual(['network down', 'network down']);
  });

  it('says what cut the content when its source fails', async () => {
    const cut = Readable.from(
      (async function* () {
        yield Buffer.alloc(MEBIBYTE, 1);
        throw new Error('client gone');
      })(),
    );

    const failure = storageOfAServiceDown()
      .put('big.bin', cut, { mediaType: 'application/octet-stream' })
      .catch((error: Error) => error.message);

    expect(await failure).toBe('client gone');
  });
});
