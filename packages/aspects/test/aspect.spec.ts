import { describe, expect, it } from 'vitest';
import { LIFECYCLE_HOOKS, defineAspect, type JoinPoint } from '../src';
import { PROBE } from './support/probe';
import { QuoteGateway } from './support/quote-gateway';
import { recording } from './support/recording';

describe('the wrapper an aspect answers', () => {
  it('answers a wrapper of the same class and leaves the instance alone', async () => {
    const journal: string[] = [];
    const gateway = new QuoteGateway();

    const wrapped = recording(journal)(gateway);

    expect(wrapped).not.toBe(gateway);
    expect(wrapped).toBeInstanceOf(QuoteGateway);
    expect(Object.getOwnPropertyNames(gateway)).toEqual(Object.getOwnPropertyNames(new QuoteGateway()));

    await gateway.quote('EUR-USD');

    expect(journal).toEqual([]);
  });

  it('gives two aspects around one instance a wrapper each, with its own advice and the state of the instance', async () => {
    const outer: string[] = [];
    const other: string[] = [];
    const gateway = new QuoteGateway();
    const first = recording(outer)(gateway);
    const second = recording(other)(gateway);

    await first.reprice(1.2);

    expect(first).not.toBe(second);
    expect(await second.quote('EUR-USD')).toEqual({ pair: 'EUR-USD', rate: 1.2 });
    expect(outer).toEqual(['around > QuoteGateway.reprice', 'around < QuoteGateway.reprice']);
    expect(other).toEqual(['around > QuoteGateway.quote', 'around < QuoteGateway.quote']);
    expect(gateway.rate).toBe(1.2);
  });

  it('answers the instance itself when no method is advised', () => {
    const gateway = new QuoteGateway();

    expect(defineAspect(() => undefined)(gateway)).toBe(gateway);
  });

  it('keeps on the wrapper a method put on it afterwards, as a tracer that shadows in place does', async () => {
    const journal: string[] = [];
    const gateway = new QuoteGateway();
    const wrapped = recording(journal)(gateway);
    const advised = wrapped.quote;

    Object.defineProperty(wrapped, 'quote', {
      value: async (pair: string) => {
        journal.push('span');

        return advised.call(wrapped, pair);
      },
      writable: true,
      configurable: true,
    });

    await wrapped.quote('EUR-USD');

    expect(journal).toEqual(['span', 'around > QuoteGateway.quote', 'around < QuoteGateway.quote']);
    expect(Object.hasOwn(gateway, 'quote')).toBe(false);
  });

  it('lets a field assigned or defined on the wrapper reach the instance, a function included', () => {
    class Feed {
      label = 'none';

      onQuote: ((pair: string) => void) | undefined = undefined;

      async poll(): Promise<void> {}
    }

    const feed = new Feed();
    const wrapped = recording([])(feed);
    const listener = (): void => undefined;

    wrapped.onQuote = listener;
    Object.defineProperty(wrapped, 'label', { value: 'rates', writable: true, configurable: true, enumerable: true });

    expect(feed.onQuote).toBe(listener);
    expect(feed.label).toBe('rates');
  });
});

describe('an aspect applied to an instance', () => {
  it('runs around asynchronous methods, which keep this and their private state', async () => {
    const journal: string[] = [];
    const gateway = recording(journal)(new QuoteGateway());

    await gateway.reprice(1.2);

    expect(await gateway.quote('EUR-USD')).toEqual({ pair: 'EUR-USD', rate: 1.2 });

    expect(journal).toEqual([
      'around > QuoteGateway.reprice',
      'around < QuoteGateway.reprice',
      'around > QuoteGateway.quote',
      'around < QuoteGateway.quote',
    ]);
  });

  it('keeps the name and the declared parameters of a wrapped method', () => {
    const gateway = recording([])(new QuoteGateway());

    expect(gateway.quote.name).toBe('quote');
    expect(gateway.quote).toHaveLength(1);
  });

  it('leaves synchronous methods, getters, generators, symbols and lifecycle hooks alone', async () => {
    const journal: string[] = [];
    const gateway = recording(journal)(new QuoteGateway());

    expect(gateway.describe()).toBe('quotes at 1.08');
    expect(gateway.rate).toBe(1.08);
    expect([...gateway.pairs()]).toEqual(['EUR-USD']);
    expect(await gateway[PROBE]()).toBe('probed');
    expect(await gateway.onModuleInit()).toBe('initialized');
    expect(LIFECYCLE_HOOKS).toContain('onModuleInit');
    expect(journal).toEqual([]);
  });

  it('advises a method that merely returns a promise from its second call', async () => {
    class LateGateway {
      readonly calls: string[] = [];

      quoteLater(pair: string): Promise<string> {
        this.calls.push(`quoteLater:${pair}`);

        return Promise.resolve(pair);
      }
    }

    const journal: string[] = [];
    const gateway = recording(journal)(new LateGateway());

    await gateway.quoteLater('EUR-USD');
    expect(journal).toEqual([]);
    await gateway.quoteLater('EUR-GBP');

    expect(journal).toEqual(['around > LateGateway.quoteLater', 'around < LateGateway.quoteLater']);
    expect(gateway.calls).toEqual(['quoteLater:EUR-USD', 'quoteLater:EUR-GBP']);
  });

  it('is a no-op the second time', async () => {
    const journal: string[] = [];
    const aspect = recording(journal);
    const gateway = aspect(aspect(new QuoteGateway()));

    await gateway.quote('EUR-USD');

    expect(journal).toHaveLength(2);
  });
});

describe('the advice of an aspect', () => {
  it('tells the advice what the composition root knows', () => {
    const seen: JoinPoint[] = [];

    const spying = defineAspect((joinPoint) => {
      seen.push(joinPoint);

      return undefined;
    });

    const gateway = new QuoteGateway();

    spying(gateway, { kind: 'external', context: 'pricing', token: 'pricing.Quotes', className: 'Quotes' });

    expect(seen.find((joinPoint) => joinPoint.method === 'quote')).toEqual({
      instance: gateway,
      className: 'Quotes',
      method: 'quote',
      arity: 1,
      kind: 'external',
      context: 'pricing',
      token: 'pricing.Quotes',
    });
  });

  it('passes the arguments an advice changed', async () => {
    const upperCased = defineAspect(
      () =>
        ({ args, proceed }) =>
          proceed(args.map((arg) => (typeof arg === 'string' ? arg.toUpperCase() : arg))),
    );

    const gateway = upperCased(new QuoteGateway());

    expect(await gateway.quote('eur-usd')).toMatchObject({ pair: 'EUR-USD' });
  });
});
