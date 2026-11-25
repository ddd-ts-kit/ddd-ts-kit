import type { Payload } from './payload';

export interface RouteResponse {
  readonly status: number;
  /** Lower-case names. `content-type` is set whenever there is something to write. */
  readonly headers: Readonly<Record<string, string>>;
  /** What an adapter writes, as it is. */
  readonly payload: Payload;
  /**
   * The value answered, before anything wrote it: what the handler returned, without the fields
   * the caller is not shown, or the problem document of a refusal. What a spec calling
   * `executeRoute` reads and what an RPC procedure returns. Absent for a list read as it comes,
   * which is its chunks only.
   */
  readonly body?: unknown;
}
