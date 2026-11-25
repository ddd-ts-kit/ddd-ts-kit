import { restartTestData } from '../builders/restart-test-data';

/** The `beforeEach` of Jest: a global where `setupFilesAfterEnv` runs this file. */
declare const beforeEach: (setup: () => void) => unknown;

// Listed in `setupFilesAfterEnv` of the runner config, so that no spec has to remember it.
beforeEach(restartTestData);
