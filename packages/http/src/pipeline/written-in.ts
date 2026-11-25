import { Readable } from 'node:stream';
import type { BodyShape } from '../representation/body-shape';
import type { Chosen } from '../representation/representations';
import { isAsyncIterable } from '../support/is-async-iterable';
import { closingWith } from './closing-with';
import { reportedStream } from './reported-stream';
import type { RepresentedAnswer } from './represented-answer';

interface Written {
  readonly chosen: Chosen;
  readonly shape: BodyShape;
  /** Told of a list that fails while its chunks are read. */
  readonly interrupted?: (error: unknown) => void;
}

/**
 * A value in the representation chosen for it: its text at once, or a stream of its chunks for a
 * list read as it comes. A value the representation cannot write fails here, inside the pipeline.
 */
export function writtenIn(value: unknown, { chosen, shape, interrupted }: Written): RepresentedAnswer {
  const headers = { 'content-type': `${chosen.mediaType}; charset=utf-8` };
  const written = chosen.representation.write(value, shape);

  if (typeof written === 'string') {
    return { headers, payload: { kind: 'text', text: written } };
  }

  const chunks = isAsyncIterable(value) ? closingWith(written, value) : written;
  const reported = interrupted === undefined ? chunks : reportedStream(chunks, interrupted);

  return { headers, payload: { kind: 'stream', stream: Readable.from(reported) } };
}
