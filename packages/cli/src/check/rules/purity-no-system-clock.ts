import { definePurityRule } from '../purity/define-purity-rule';
import { PURITY_TABLES } from '../purity/reference/purity-tables';

export const purityNoSystemClock = definePurityRule(PURITY_TABLES['purity/no-system-clock'], {
  why: 'Code that reads the clock gives a different answer every time it runs, so its tests are either flaky or need a mocked module. Passing the instant in, from the Clock port, makes every rule about time testable with a fixed date and replayable in production.',
  bad: `isOverdue(): boolean { return this.dueDate < new Date(); }`,
  good: `isOverdue(now: Date): boolean { return this.dueDate < now; }`,
});
