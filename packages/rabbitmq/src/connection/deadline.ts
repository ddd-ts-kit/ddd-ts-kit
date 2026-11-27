import { answeredWithin } from './answered-within';
import { type Closable, openedWithin } from './opened-within';

/**
 * One bound for a whole call, however many requests it makes: each request has the time that
 * the requests before it left.
 */
export class Deadline {
  private readonly endsAt: number;

  constructor(ms: number) {
    this.endsAt = performance.now() + ms;
  }

  get leftMs(): number {
    return Math.max(0, this.endsAt - performance.now());
  }

  answered<T>(request: Promise<T>): Promise<T> {
    return answeredWithin(this.leftMs, request);
  }

  opened<T extends Closable>(opening: Promise<T>): Promise<T> {
    return openedWithin(this.leftMs, opening);
  }
}
