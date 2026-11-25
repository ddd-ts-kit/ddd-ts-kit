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
import type { Route } from '../route/route';

export type ExpressMountOptions = ExecuteOptions;

type ExpressHandler = (request: Request, response: Response) => Promise<void>;

type Registrar = Record<HttpMethod, (path: string, ...handlers: RequestHandler[]) => void>;

/**
 * Registers the routes on an Express 5 application or router. A JSON body parser
 * (`express.json()`) must be installed before, otherwise bodies reach validation as `undefined`.
 * An upload and a raw body are read from the request stream, which that parser leaves alone
 * unless the request is JSON, whose bytes a raw body then takes from `request.rawBody`
 * (`express.json({ verify: (request, _, bytes) => { request.rawBody = bytes; } })`); a route that consumes another media type (`consumes`) gets a text
 * parser of its own for it. A file and a list read as it comes are piped to the response,
 * at the pace the client reads them.
 */
export function mountExpress(target: IRouter, routes: readonly Route[], options: ExpressMountOptions = {}): void {
  assertUniqueRoutes(routes);
  assertServed(routes, options.representations);
  assertCachedRoutes(routes, options);

  const register = registrarOf(target);

  for (const route of routes) {
    register[route.method](route.path, ...bodyParsers(route), handlerOf(route, options));
  }
}

function bodyParsers(route: Route): RequestHandler[] {
  const consumed = route.consumes ?? [];

  return consumed.length === 0 ? [] : [express.text({ type: [...consumed] })];
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

function handlerOf(route: Route, options: ExpressMountOptions): ExpressHandler {
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
