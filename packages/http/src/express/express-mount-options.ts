import type { ExecuteOptions } from '../pipeline/execute-options';

export interface ExpressMountOptions extends ExecuteOptions {
  /**
   * The largest body the adapter reads, in bytes, JSON or a media type a route consumes: a larger
   * one is answered 413 as a problem (`BODY_TOO_LARGE`) by `problemErrorHandler`. 1 MiB by default,
   * what Fastify and Hono read. A body a parser of the application read first has that parser's
   * limit, and an upload the limit its route declares.
   */
  readonly bodyLimit?: number;
}
