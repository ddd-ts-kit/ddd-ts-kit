import type { Readable } from 'node:stream';

/**
 * What an adapter writes for an answer, decided by the pipeline: nothing is left for a framework
 * to serialize, so a value that cannot be written is an error of the route like any other.
 * `text` is written already (JSON, another representation, a problem document, the text of a
 * handler that set its own content type); `stream` is a file, or the chunks of a list read as it
 * comes.
 */
export type Payload =
  | { readonly kind: 'none' }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  | { readonly kind: 'stream'; readonly stream: Readable };

export const NOTHING: Payload = { kind: 'none' };
