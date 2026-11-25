import { describe, expect, it } from 'vitest';
import { resolve, sequence } from '../src';
import { dataGenerator, generated } from '../src/faker';
import '../src/setup-vitest';

const probe = sequence('setup-probe');
const drawn = generated((faker) => faker.number.int());

describe('the setup entry of vitest', () => {
  const draws = new Array<number>();

  it.each(['a first test', 'the test after it'])('starts every sequence at 1 before %s', () => {
    expect(resolve(probe)).toBe('setup-probe-1');
    expect(resolve(probe)).toBe('setup-probe-2');
  });

  it.each(['a first test', 'the test after it'])('starts the data generator at its seed before %s', () => {
    draws.push(resolve(drawn));

    expect(new Set(draws).size).toBe(1);
    expect(dataGenerator().seed).toBeTypeOf('number');
  });
});

describe('the setup entry of jest', () => {
  it('hands the restart to the beforeEach Jest makes global', async () => {
    const registered = new Array<() => void>();

    Reflect.set(globalThis, 'beforeEach', (setup: () => void) => registered.push(setup));

    try {
      await import('../src/setup-jest');
    } finally {
      Reflect.deleteProperty(globalThis, 'beforeEach');
    }

    resolve(probe);

    registered.forEach((setup) => {
      setup();
    });

    expect(registered).toHaveLength(1);
    expect(resolve(probe)).toBe('setup-probe-1');
  });
});
