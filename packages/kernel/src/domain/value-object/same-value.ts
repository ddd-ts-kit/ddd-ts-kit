import { isPlainRecord } from './is-plain-record';

/**
 * Whether two values a value object holds are the same value: a date by its instant, a list item
 * by item, a plain record name by name, and a value that compares itself (a value object) by its
 * own `equals`, so that its class counts. Anything else has no content this function can read,
 * and is refused instead of being found equal.
 */
export function sameValue(one: unknown, other: unknown): boolean {
  return one === other || bothNotANumber(one, other) || (isObject(one) && sameContent(one, other));
}

function bothNotANumber(one: unknown, other: unknown): boolean {
  return Number.isNaN(one) && Number.isNaN(other);
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function sameContent(one: object, other: unknown): boolean {
  if (one instanceof Date) {
    return other instanceof Date && one.getTime() === other.getTime();
  }

  if (Array.isArray(one)) {
    return Array.isArray(other) && sameItems(one, other);
  }

  if (isPlainRecord(one)) {
    return isPlainRecord(other) && sameEntries(one, other);
  }

  if (comparesItself(one)) {
    return one.equals(other);
  }

  throw new TypeError(
    `A value object cannot compare a ${one.constructor.name}: hold it as plain data (text, number, date, list, record) or as a value object.`,
  );
}

function sameItems(one: readonly unknown[], other: readonly unknown[]): boolean {
  return one.length === other.length && one.every((item, index) => sameValue(item, other[index]));
}

function sameEntries(one: Readonly<Record<string, unknown>>, other: Readonly<Record<string, unknown>>): boolean {
  const names = Object.keys(one);

  return (
    names.length === Object.keys(other).length &&
    names.every((name) => Object.hasOwn(other, name) && sameValue(one[name], other[name]))
  );
}

function comparesItself(value: object): value is { equals(other: unknown): boolean } {
  return 'equals' in value && typeof value.equals === 'function';
}
