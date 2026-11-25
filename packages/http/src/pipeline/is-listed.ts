import { Readable } from 'node:stream';
import { isAsyncIterable } from '../support/is-async-iterable';

/** Whether a body is a list read as it comes: items in order, and not a file, which is read in order too. */
export function isListed(body: unknown): body is AsyncIterable<unknown> {
  return isAsyncIterable(body) && !(body instanceof Readable);
}
