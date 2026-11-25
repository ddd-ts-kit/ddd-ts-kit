import type { Payload } from './payload';

/** What an answer is written as, and the headers that say so. */
export interface RepresentedAnswer {
  readonly headers: Readonly<Record<string, string>>;
  readonly payload: Payload;
}
