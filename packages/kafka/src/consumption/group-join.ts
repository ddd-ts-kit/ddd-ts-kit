import { ignore } from '../ignore';

/**
 * The wait of a member for the partitions the group owes it. A subscription added while the
 * group joins waits for the same answer: there is one wait at a time, so whoever asked first
 * is told with the others, and nobody holds a promise that no assignment resolves.
 */
export class GroupJoin {
  private answered: Promise<void> = Promise.resolve();

  private answer: () => void = ignore;

  private awaited = false;

  /** The member asked the group for partitions: it waits, unless it already does. */
  asked(): void {
    if (this.awaited) {
      return;
    }

    this.awaited = true;

    this.answered = new Promise((resolve) => {
      this.answer = resolve;
    });
  }

  /** The partitions came, or the member gave the join up. */
  settled(): void {
    this.awaited = false;
    this.answer();
  }

  /** Resolves once the member waits for no partition. */
  over(): Promise<void> {
    return this.answered;
  }
}
