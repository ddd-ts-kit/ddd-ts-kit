import { Readable } from 'node:stream';
import type { BodyShape } from '../representation/body-shape';
import { JsonRepresentation } from '../representation/json-representation';
import type { Chosen } from '../representation/representations';
import type { RouteOutput } from '../route/route-output';
import type { Route } from '../route/route';
import { jsonSchemaOf } from '../schema/json-schema-of';
import { isAsyncIterable } from '../support/is-async-iterable';
import { primed } from './primed';
import type { RepresentedAnswer } from './represented-answer';
import { writtenIn } from './written-in';

const KIT_JSON: Chosen = { mediaType: 'application/json', representation: new JsonRepresentation() };
/** JSON writes a value as it is: it reads no schema. */
const NO_SHAPE: BodyShape = { schema: {}, name: '' };

/**
 * The answer of a route in the media type the request negotiated. A binary body, a file stream, is
 * the handler's own and is left as it is. When nothing was negotiated, the value is the adapter's
 * to serialize, and a list read as it comes is written as JSON, the one media type a server
 * without representations answers in.
 */
export async function represented(
  route: Route,
  result: RouteOutput,
  chosen: Chosen | undefined,
): Promise<RepresentedAnswer> {
  const { body } = result;

  if (body === undefined) {
    return { headers: {} };
  }

  if (body instanceof Uint8Array || body instanceof Readable) {
    return { headers: {}, body };
  }

  if (chosen === undefined) {
    return isAsyncIterable(body) ? writtenIn(await primed(body), KIT_JSON, NO_SHAPE) : { headers: {}, body };
  }

  const schema = route.responses[result.status]?.body;
  const shape: BodyShape = { schema: schema === undefined ? {} : jsonSchemaOf(schema), name: route.operationId };

  return writtenIn(isAsyncIterable(body) ? await primed(body) : body, chosen, shape);
}
