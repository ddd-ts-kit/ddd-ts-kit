import { MAX_SIGNED_URL_SECONDS, type SignedUpload } from '@ddd-ts-kit/kernel';
import { PDF, TEXT } from './contents';
import { tampered } from './tampered';
import { followWithFetch } from './follow-with-fetch';
import type { FollowedResponse } from './followed-response';
import { FileStorageSuite } from './file-storage-suite';
import type { SignedRequest } from './signed-request';

/** A signed link grants one action on one file, for a short time, to whoever holds it unchanged. */
export class SignedLinksSuite extends FileStorageSuite {
  protected tests(): void {
    this.downloads();
    this.refusesAnExpiredDownload();
    this.uploads();
    this.refuses();
  }

  private downloads(): void {
    this.it('downloads the file through its link, under the name it was signed with', async () => {
      await this.write('documents/report.pdf', PDF);

      const link = await this.subject.signedDownloadUrl('documents/report.pdf', {
        expiresInSeconds: 300,
        fileName: 'report.pdf',
      });

      const longer = await this.subject.signedDownloadUrl('documents/report.pdf', { expiresInSeconds: 600 });
      const response = await this.follow({ url: link.url, method: 'GET' });

      this.expect([response.status, response.body]).toEqual([200, PDF]);

      this.holds(
        response.headers['content-disposition']?.includes('report.pdf') === true,
        `the download does not carry the file name the link was signed with: its content-disposition is ${String(response.headers['content-disposition'])}`,
      );

      this.holds(
        Math.abs(longer.expiresAt.getTime() - link.expiresAt.getTime() - 300_000) < 5_000,
        'a link signed for 600 seconds does not expire 300 seconds after a link signed for 300',
      );
    });

    this.it('serves a link signed without a name as an attachment all the same, never inline', async () => {
      await this.write('documents/report.pdf', PDF);
      const link = await this.subject.signedDownloadUrl('documents/report.pdf', { expiresInSeconds: 300 });
      const response = await this.follow({ url: link.url, method: 'GET' });

      this.holds(
        response.headers['content-disposition']?.startsWith('attachment') === true,
        `a link signed without a name is not served as an attachment: its content-disposition is ${String(response.headers['content-disposition'])}`,
      );
    });
  }

  private refusesAnExpiredDownload(): void {
    this.it('refuses a download link once it has expired', async () => {
      await this.write('documents/report.pdf', PDF);
      const link = await this.subject.signedDownloadUrl('documents/report.pdf', { expiresInSeconds: 1 });

      await this.options.elapse(2_100);

      const { status } = await this.follow({ url: link.url, method: 'GET' });

      this.holds(status >= 400, `a download link that has expired was answered ${String(status)}`);
    });
  }

  private uploads(): void {
    this.it('stores what is sent through an upload link, with the media type it was signed for', async () => {
      const upload = await this.textUpload();

      const response = await this.follow({
        url: upload.url,
        method: upload.method,
        headers: upload.headers,
        body: TEXT,
      });

      const metadata = await this.subject.stat('staging/documents/notes.txt');

      this.holds(response.status < 300, `the upload through its signed link was answered ${String(response.status)}`);
      this.expect([metadata?.size, metadata?.mediaType]).toEqual([TEXT.length, 'text/plain']);
      this.expect(await this.read('staging/documents/notes.txt')).toEqual(TEXT);
    });

    this.it('refuses an upload sent with another media type than the one signed', async () => {
      const upload = await this.textUpload();

      const response = await this.follow({
        url: upload.url,
        method: 'PUT',
        headers: { 'content-type': 'text/html' },
        body: TEXT,
      });

      this.holds(
        response.status >= 400,
        `an upload sent with another media type than the one signed was answered ${String(response.status)}`,
      );

      this.expect(await this.subject.stat('staging/documents/notes.txt')).toBe(undefined);
    });
  }

  private refuses(): void {
    this.it('refuses a link whose signature was changed', async () => {
      await this.write('documents/report.pdf', PDF);
      const link = await this.subject.signedDownloadUrl('documents/report.pdf', { expiresInSeconds: 300 });

      const { status } = await this.follow({ url: tampered(link.url), method: 'GET' });

      this.holds(status >= 400, `a link whose signature was changed was answered ${String(status)}`);
    });

    this.it('refuses to sign a link for longer than the maximum, or for no time', async () => {
      for (const expiresInSeconds of [MAX_SIGNED_URL_SECONDS + 1, 0, 1.5]) {
        const code = await this.codeOf(() =>
          this.subject.signedDownloadUrl('documents/report.pdf', { expiresInSeconds }),
        );

        this.expect(code).toBe('INVALID_FILE_URL_EXPIRY');
      }
    });

    this.it('refuses to sign a link for a key that could leave its place', async () => {
      const code = await this.codeOf(() =>
        this.subject.signedUploadUrl('../outside', { expiresInSeconds: 60, mediaType: 'text/plain', maxBytes: 1_000 }),
      );

      this.expect(code).toBe('INVALID_FILE_KEY');
    });
  }

  private textUpload(): Promise<SignedUpload> {
    return this.subject.signedUploadUrl('staging/documents/notes.txt', {
      expiresInSeconds: 300,
      mediaType: 'text/plain',
      maxBytes: 1_000,
    });
  }

  private follow(request: SignedRequest): Promise<FollowedResponse> {
    return this.options.follow === undefined ? followWithFetch(request) : this.options.follow(request);
  }
}
