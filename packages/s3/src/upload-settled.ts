import { FileError } from '@ddd-ts-kit/kernel';

/**
 * Waits for the stream that feeds an upload and for the upload, and rejects with the failure
 * that says why. A content refused on its way cut the upload: its refusal comes first. Any
 * other failure is the one of the upload: a service that fails destroys the stream that feeds
 * it, which then only says it was aborted.
 */
export async function uploadSettled(feeding: Promise<void>, uploading: Promise<unknown>): Promise<void> {
  const [fed, uploaded] = await Promise.allSettled([feeding, uploading]);

  if (fed.status === 'rejected' && (FileError.is(fed.reason) || uploaded.status === 'fulfilled')) {
    throw fed.reason;
  }

  if (uploaded.status === 'rejected') {
    throw uploaded.reason;
  }
}
