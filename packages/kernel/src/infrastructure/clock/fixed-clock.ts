import type { Clock } from '../../application/ports/clock';

/** A clock that stands still until a test advances it. Each `now()` is a date of its own, as `SystemClock` answers. */
export class FixedClock implements Clock {
  private instant: number;

  constructor(current: Date) {
    this.instant = current.getTime();
  }

  now(): Date {
    return new Date(this.instant);
  }

  advance(ms: number): void {
    this.instant += ms;
  }
}
