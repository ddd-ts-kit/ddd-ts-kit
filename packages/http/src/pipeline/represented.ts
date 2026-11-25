import { Readable } from 'node:stream';
import type { BodyShape } from '../representation/body-shape';
import { isJsonContentType } from '../representation/is-json-content-type';
import { JsonRepresentation } from '../representation/json-representation';
import type { Chosen } from '../representation/representations';
import type { RouteOutput } from '../route/route-output';
import type { Route } from '../route/route';
import { jsonSchemaOf } from '../schema/json-schema-of';
import { isListed } from './is-listed';
import { NOTHING } from './payload';
import { primed } from './primed';
import type { RepresentedAnswer } from './represented-answer';
import type { Writing } from './writing';
import { writtenIn } from './written-in';

const KIT_JSON: Chosen = { mediaType: 'application/json', representation: new JsonRepresentation() };
const OCTETS = { 'content-type': 'application/octet-stream' };

/**
 * What the answer of a route is written as: in the media type the request negotiated, in JSON
 * when nothing was. Bytes, a file and a text under a content type the handler set itself are the
 * handler's own, and are left as they are. A list read as it comes has its first item read here,
 * while the request can still be answered with a problem.
 */
export async function represented(route: Route, result: RouteOutput, writing: Writing): Promise<RepresentedAnswer> {
  const { body } = result;
  const { chosen = KIT_JSON, interrupted } = writing;

  if (body === undefined) {
    return { headers: {}, payload: NOTHING };
  }

  if (body instanceof Uint8Array) {
    return { headers: OCTETS, payload: { kind: 'bytes', bytes: body } };
  }

  if (body instanceof Readable) {
    return { headers: OCTETS, payload: { kind: 'stream', stream: body } };
  }

  if (typeof body === 'string' && isOwnText(writing.ownContentType)) {
    return { headers: {}, payload: { kind: 'text', text: body } };
  }

  const shape = chosen === KIT_JSON ? NO_SHAPE : shapeOf(route, result.status);

  return writtenIn(isListed(body) ? await primed(body) : body, { chosen, shape, interrupted });
}

/** JSON writes a value as it is: it reads no schema. */
const NO_SHAPE: BodyShape = { schema: {}, name: '' };

function shapeOf(route: Route, status: RouteOutput['status']): BodyShape {
  const schema = route.responses[status]?.body;

  return { schema: schema === undefined ? {} : jsonSchemaOf(schema), name: route.operationId };
}

/** A text is the handler's own under a content type it chose that is not JSON; under JSON it is a JSON string. */
function isOwnText(contentType: string | undefined): boolean {
  return contentType !== undefined && !isJsonContentType(contentType);
}
