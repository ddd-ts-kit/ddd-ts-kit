import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import express, { type IRouter, type Request, type RequestHandler, type Response } from 'express';
import type { ExecuteOptions } from '../pipeline/execute-options';
import { assertCachedRoutes } from '../pipeline/assert-cached-routes';
import { executeRoute } from '../pipeline/execute-route';
import { wholeOf } from '../pipeline/whole-of';
import { assertServed } from '../representation/assert-served';
import { assertUniqueRoutes } from '../route/assert-unique-routes';
import type { HttpMethod } from '../route/http-method';
import { readsItsStream } from '../route/reads-its-stream';
import type { Route } from '../route/route';
import type { ExpressMountOptions } from './express-mount-options';

/** What Fastify reads at most by default: the same bound on every adapter that sets its own. */
const ONE_MEBIBYTE = 1_048_576;
/** JSON as the pipeline knows it: `application/json` and every `+json` suffix. */
const JSON_MEDIA_TYPES = ['application/json', 'application/*+json'];

type ExpressHandler = (request: Request, response: Response) => Promise<void>;

type Registrar = Record<HttpMethod, (path: string, ...handlers: RequestHandler[]) => void>;

/**
 * Registers the routes on an Express 5 application or router. The adapter reads the body of each
 * route itself, up to `bodyLimit` (1 MiB by default): JSON whatever its value, an object or not,
 * for the schema of the route to decide as on the other frameworks, and a media type the route
 * consumes (`consumes`) as text, for its representation. A body a parser of the application read
 * first (`express.json()`, which refuses a JSON value that is no object or array unless given
 * `strict: false`) is taken as that parser read it. An upload and a raw body are read from the
 * request stream, which no parser of the adapter touches; behind a JSON parser of the
 * application, a raw body takes the bytes that parser kept in `request.rawBody`
 * (`express.json({ verify: (request, _, bytes) => { request.rawBody = bytes; } })`). A file and a
 * list read as it comes are piped to the response, at the pace the client reads them.
 */
export function mountExpress(target: IRouter, routes: readonly Route[], options: ExpressMountOptions = {}): void {
  assertUniqueRoutes(routes);
  assertServed(routes, options.representations);
  assertCachedRoutes(routes, options);

  const { bodyLimit = ONE_MEBIBYTE, ...execute } = options;
  const register = registrarOf(target);

  for (const route of routes) {
    register[route.method](route.path, ...bodyParsers(route, bodyLimit), handlerOf(route, execute));
  }
}

/** None for a route that reads its own stream; else JSON, and what the route consumes as text. A request already read is left as it is. */
function bodyParsers(route: Route, limit: number): RequestHandler[] {
  if (readsItsStream(route)) {
    return [];
  }

  const consumed = route.consumes ?? [];

  return [
    express.json({ strict: false, limit, type: JSON_MEDIA_TYPES }),
    ...(consumed.length === 0 ? [] : [express.text({ type: [...consumed], limit })]),
  ];
}

function registrarOf(target: IRouter): Registrar {
  return {
    GET: (path, ...handlers) => target.get(path, ...handlers),
    POST: (path, ...handlers) => target.post(path, ...handlers),
    PUT: (path, ...handlers) => target.put(path, ...handlers),
    PATCH: (path, ...handlers) => target.patch(path, ...handlers),
    DELETE: (path, ...handlers) => target.delete(path, ...handlers),
    HEAD: (path, ...handlers) => target.head(path, ...handlers),
    OPTIONS: (path, ...handlers) => target.options(path, ...handlers),
  };
}

function handlerOf(route: Route, options: ExecuteOptions): ExpressHandler {
  return async (request, response) => {
    const { params, query, headers } = request;
    // A parser reads an empty body as `{}`: a request that declares no bytes has no body, as on the other frameworks.
    const body: unknown = headers['content-length'] === '0' ? undefined : request.body;

    const {
      status,
      headers: answered,
      payload,
    } = await executeRoute(route, { params, query, headers, body, raw: request, stream: streamOf(request) }, options);

    response.status(status).set(answered);

    if (payload.kind === 'stream') {
      // A stream that fails once the status is sent can only cut the response short.
      await pipeline(payload.stream, response).catch(() => response.destroy());
    } else {
      response.end(wholeOf(payload));
    }
  };
}

/**
 * The body as it arrived. A JSON parser installed before the route has read the request already:
 * the bytes it kept in `request.rawBody` (`express.json({ verify })`, or Nest created with
 * `rawBody: true`) are then the stream.
 */
function streamOf(request: Request): Readable {
  const kept: unknown = Reflect.get(request, 'rawBody');

  return request.readableEnded && Buffer.isBuffer(kept) ? Readable.from([kept]) : request;
}
