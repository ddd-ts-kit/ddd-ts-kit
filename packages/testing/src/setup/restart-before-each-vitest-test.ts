import { beforeEach } from 'vitest';
import { restartTestData } from '../builders/restart-test-data';

// Listed in `setupFiles` of the runner config, so that no spec has to remember it.
beforeEach(restartTestData);
