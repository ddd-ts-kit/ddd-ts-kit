import { describe, expect, it } from 'vitest';
import { ValueObject, type StoredFile, type ValueObjectProps } from '../src';

class Currency extends ValueObject<{ readonly code: string }> {
  static of(code: string): Currency {
    return new Currency({ code });
  }
}

class Unit extends ValueObject<{ readonly code: string }> {
  static of(code: string): Unit {
    return new Unit({ code });
  }
}

class Money extends ValueObject<{ readonly amount: number; readonly in: Currency | Unit }> {
  static of(amount: number, currency: Currency | Unit): Money {
    return new Money({ amount, in: currency });
  }
}

class Basket extends ValueObject<{ readonly prices: readonly Money[] }> {
  static of(...prices: Money[]): Basket {
    return new Basket({ prices });
  }
}

class Reading extends ValueObject<{ readonly value: number }> {
  static of(value: number): Reading {
    return new Reading({ value });
  }
}

class Anything extends ValueObject<ValueObjectProps> {
  /** What a cast lets through: the type of the props refuses these values. */
  static holding(held: unknown): Anything {
    return new Anything({ held } as ValueObjectProps);
  }
}

class Attachment extends ValueObject<{ readonly file: StoredFile; readonly labels: Readonly<Record<string, string>> }> {
  static of(file: StoredFile): Attachment {
    return new Attachment({ file, labels: {} });
  }
}

describe('the props of a ValueObject', () => {
  it('hold primitives, dates, value objects, lists and plain records of those', () => {
    const file = { key: 'k', size: 1, mediaType: 'text/plain', checksum: 'sha256:00' };

    expect(Attachment.of(file).equals(Attachment.of({ ...file }))).toBe(true);
  });

  it('do not compile with a value that cannot be compared', () => {
    // @ts-expect-error -- a Map is not plain data: its content is not in its keys
    class Tags extends ValueObject<{ readonly tags: Map<string, string> }> {}

    // @ts-expect-error -- a function is not a value
    class Rule extends ValueObject<{ readonly holds: () => boolean }> {}

    // @ts-expect-error -- unknown may be anything
    class Loose extends ValueObject<{ readonly held: unknown }> {}

    expect([Tags, Rule, Loose]).toHaveLength(3);
  });
});

describe('ValueObject.equals', () => {
  it('asks a nested value object, so one of another class with the same values differs', () => {
    expect(Money.of(5, Currency.of('EUR')).equals(Money.of(5, Currency.of('EUR')))).toBe(true);
    expect(Money.of(5, Currency.of('EUR')).equals(Money.of(5, Currency.of('USD')))).toBe(false);
    expect(Money.of(5, Currency.of('EUR')).equals(Money.of(5, Unit.of('EUR')))).toBe(false);
  });

  it('asks the value objects of a list one by one', () => {
    const five = () => Money.of(5, Currency.of('EUR'));

    expect(Basket.of(five(), five()).equals(Basket.of(five(), five()))).toBe(true);
    expect(Basket.of(five(), five()).equals(Basket.of(five(), Money.of(5, Unit.of('EUR'))))).toBe(false);
  });

  it('tells a date from a record, and a list from a record of its indexes', () => {
    expect(Anything.holding(new Date(0)).equals(Anything.holding({}))).toBe(false);
    expect(Anything.holding({}).equals(Anything.holding(new Date(0)))).toBe(false);
    expect(Anything.holding([1, 2]).equals(Anything.holding({ 0: 1, 1: 2 }))).toBe(false);
    expect(Anything.holding({ 0: 1, 1: 2 }).equals(Anything.holding([1, 2]))).toBe(false);
    expect(Anything.holding(Currency.of('EUR')).equals(Anything.holding({ code: 'EUR' }))).toBe(false);
  });

  it('reads zero and minus zero as one number, and not a number as itself', () => {
    expect(Reading.of(0).equals(Reading.of(-0))).toBe(true);
    expect(Reading.of(Number.NaN).equals(Reading.of(Number.NaN))).toBe(true);
    expect(Reading.of(Number.NaN).equals(Reading.of(0))).toBe(false);
  });

  it.each([
    ['a Map', new Map([['a', 1]]), new Map([['b', 2]]), 'Map'],
    ['a Set', new Set([1]), new Set([2]), 'Set'],
    ['a RegExp', /a/, /b/, 'RegExp'],
    ['a URL', new URL('https://a.example'), new URL('https://b.example'), 'URL'],
  ])('refuses to compare %s instead of finding two of them equal', (_what, one, other, named) => {
    expect(() => Anything.holding(one).equals(Anything.holding(other))).toThrow(
      new TypeError(
        `A value object cannot compare a ${named}: hold it as plain data (text, number, date, list, record) or as a value object.`,
      ),
    );
  });

  it('finds one same instance equal to itself, whatever it is', () => {
    const map = new Map([['a', 1]]);

    expect(Anything.holding(map).equals(Anything.holding(map))).toBe(true);
  });
});
