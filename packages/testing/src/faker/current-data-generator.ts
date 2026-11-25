import { restartedWithTestData } from '../builders/restart-test-data';
import { createDataGenerator } from './create-data-generator';
import type { DataGenerator } from './data-generator';

let current: DataGenerator | undefined;

// Each test draws from the seed again: what it generates does not depend on the tests before it.
restartedWithTestData(() => current?.restart());

/**
 * The generator every `generated` value is drawn from, so that one seed replays a whole test
 * file. Created on first use, from `TEST_SEED` or a random seed.
 */
export function dataGenerator(): DataGenerator {
  current ??= createDataGenerator();

  return current;
}

/** Makes `generated` draw from this generator from now on. */
export function useDataGenerator(generator: DataGenerator): DataGenerator {
  current = generator;

  return generator;
}
