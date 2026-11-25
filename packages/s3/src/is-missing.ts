import { S3ServiceException } from '@aws-sdk/client-s3';

/**
 * Whether the service answered that the object does not exist: `NoSuchKey` on a read, `NotFound`
 * on a head. By name, never by status: a bucket that does not exist is a 404 too (`NoSuchBucket`),
 * and a deployment to fix must not read as an absent file.
 */
export function isMissing(error: unknown): boolean {
  return error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.name === 'NotFound');
}
