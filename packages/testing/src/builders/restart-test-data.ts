const restarts = new Set<() => void>();

/** Registers what a test must not inherit from the one before it: `restart` puts it back as a first test finds it. */
export function restartedWithTestData(restart: () => void): void {
  restarts.add(restart);
}

/**
 * Starts again what a test would inherit from the one before it: every sequence at 1 and, where
 * `@ddd-ts-kit/testing/faker` is in use, the data generator at its seed. The setup entries
 * `@ddd-ts-kit/testing/setup/vitest` and `@ddd-ts-kit/testing/setup/jest` call it before each
 * test, so that no value depends on the order of the tests of a file.
 */
export function restartTestData(): void {
  for (const restart of restarts) {
    restart();
  }
}
