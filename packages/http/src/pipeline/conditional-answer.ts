import type { CachePolicy } from '../cache/cache-policy';
import type { RawHeaders } from '../route/raw-headers';
import type { Route } from '../route/route';
import { entityTagOf } from './entity-tag-of';
import { isNotModified } from './is-not-modified';
import { lastModifiedOf } from './last-modified-of';
import { NOTHING } from './payload';
import type { RouteResponse } from './route-response';

const NOT_MODIFIED = 304;
const SUCCESS_FROM = 200;
const SUCCESS_TO = 299;
const READS: readonly string[] = ['GET', 'HEAD'];

/**
 * A successful read that declares validators answers its `ETag` and `Last-Modified`, and
 * `304 Not Modified` without a body when the caller already holds that version. A header the
 * handler answered itself wins. A version and an instant are read from `value`, what the handler
 * answered, whatever representation wrote it; a strong `ETag` digests the bytes sent, so an
 * answer streamed, a file or a list read as it comes, whose bytes are not known when its headers go, has none.
 */
export async function conditionalAnswer(
  route: Pick<Route, 'method' | 'cache'>,
  request: Readonly<RawHeaders>,
  answered: { readonly response: RouteResponse; readonly value: unknown },
): Promise<RouteResponse> {
  const { cache } = route;
  const { response, value } = answered;

  if (cache === undefined || response.status < SUCCESS_FROM || response.status > SUCCESS_TO) {
    return response;
  }

  const headers = { ...(await validatorsOf(cache, response, value)), ...response.headers };

  if (!READS.includes(route.method) || !isNotModified(request, headers)) {
    return { ...response, headers };
  }

  release(response);

  return {
    status: NOT_MODIFIED,
    headers: Object.fromEntries(Object.entries(headers).filter(([name]) => name !== 'content-type')),
    payload: NOTHING,
  };
}

/** A stream nobody will read is closed: the file, or the cursor of the list, it was opened on. */
function release({ payload }: RouteResponse): void {
  if (payload.kind === 'stream') {
    payload.stream.destroy();
  }
}

async function validatorsOf(
  cache: CachePolicy,
  response: RouteResponse,
  value: unknown,
): Promise<Record<string, string>> {
  const etag = cache.etag === undefined ? undefined : await entityTagOf(cache.etag, response.payload, value);

  return {
    ...(etag === undefined ? {} : { etag }),
    ...(cache.lastModified === undefined ? {} : { 'last-modified': lastModifiedOf(cache.lastModified, value) }),
  };
}
