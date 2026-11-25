import { isJsonMediaType } from './is-json-media-type';
import { mediaTypeOf } from './media-type-of';

/** Whether a `Content-Type` header names JSON, whatever its parameters: the one reading of it for a body read and a body written. */
export function isJsonContentType(header: string | string[] | undefined): boolean {
  return isJsonMediaType(mediaTypeOf(header) ?? '');
}
