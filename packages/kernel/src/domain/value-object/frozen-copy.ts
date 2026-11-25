import { isPlainRecord } from './is-plain-record';

/**
 * A copy of plain data that nothing can change, and that no longer shares anything with what it
 * was copied from: lists and plain records are copied and frozen in depth, a date is copied.
 * Anything else is handed as it is: a primitive and a value object cannot change, a function
 * holds nothing to copy. Data that holds itself is refused.
 */
export function frozenCopy<Data>(data: Data): Data;

export function frozenCopy(data: unknown): unknown {
  return copyOf(data, []);
}

/** `holders` are the lists and records being copied around `value`: finding it among them is a cycle. */
function copyOf(value: unknown, holders: unknown[]): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (holders.includes(value)) {
    throw new TypeError('Data that holds itself cannot be copied: a value has no cycle.');
  }

  holders.push(value);

  const copy = copyOfContent(value, holders);

  holders.pop();

  return copy;
}

function copyOfContent(value: object, holders: unknown[]): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => copyOf(item, holders)));
  }

  return isPlainRecord(value) ? Object.freeze(copyOfRecord(value, holders)) : value;
}

function copyOfRecord(record: Readonly<Record<string, unknown>>, holders: unknown[]): Record<string, unknown> {
  const copy: Record<string, unknown> = {};

  for (const name of Object.keys(record)) {
    copy[name] = copyOf(record[name], holders);
  }

  return copy;
}
