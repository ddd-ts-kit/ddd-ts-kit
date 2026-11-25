import { isAsyncIterable } from '../support/is-async-iterable';
import type { RepresentedBody } from './represented-body';
import { malformedBody } from './malformed-body';
import type { Representation } from './representation';

const MEDIA_TYPE = 'application/json';

/**
 * `application/json`, the default of every route: the value as `JSON.stringify` writes it, an
 * instant in ISO 8601 UTC, a big integer as a string. A streamed list is written as one array,
 * an item at a time.
 */
export class JsonRepresentation implements Representation {
  readonly mediaType = MEDIA_TYPE;

  readonly problemMediaType = 'application/problem+json';

  write(body: unknown): RepresentedBody {
    return isAsyncIterable(body) ? jsonArray(body) : stringified(body);
  }

  read(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      throw malformedBody(MEDIA_TYPE);
    }
  }
}

async function* jsonArray(items: AsyncIterable<unknown>): AsyncIterable<string> {
  let separator = '';

  yield '[';

  for await (const item of items) {
    yield `${separator}${stringified(item)}`;
    separator = ',';
  }

  yield ']';
}

function stringified(value: unknown): string {
  // An item of an array that is undefined is written null, as `JSON.stringify` writes it inside an array.
  if (value === undefined) {
    return 'null';
  }

  // A function, a symbol: `JSON.stringify` answers nothing for them, which its declaration does not say.
  const text: unknown = JSON.stringify(value, bigIntegersAsText);

  if (typeof text !== 'string') {
    throw new TypeError('The answer is a value JSON does not write.');
  }

  return text;
}

function bigIntegersAsText(_key: string, part: unknown): unknown {
  return typeof part === 'bigint' ? part.toString() : part;
}
