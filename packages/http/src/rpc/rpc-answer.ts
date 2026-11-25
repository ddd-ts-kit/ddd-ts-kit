import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { ErrorMapper } from '../error/error-mapper';
import type { Problem } from '../error/problem';
import { toProblem } from '../error/to-problem';
import type { RouteResponse } from '../pipeline/route-response';
import { isJsonContentType } from '../representation/is-json-content-type';
import { NotAcceptableError } from '../representation/not-acceptable-error';
import { isRecord } from '../support/is-record';
import type { RpcRefusal } from './rpc-refusal';

const FIRST_REFUSAL_STATUS = 400;

/** What tells one RPC protocol from another for the answer of a route. */
export interface RpcProtocol {
  /** The error the protocol throws for a refusal. */
  readonly refuse: (refusal: RpcRefusal) => Error;
  /** Whether the protocol returns a binary body, as a `Blob`. When it does not, a binary body is refused as a file is. */
  readonly carriesBinary: boolean;
}

/**
 * What a procedure returns for the answer of its route: the body of a success as JSON writes it,
 * a binary body as a `Blob` when the protocol carries one. A refusal is thrown as the error of the
 * protocol, with its problem document. A file and a list read as it comes are refused with 406 and
 * closed: they are streamed because they may not fit in memory, and only the HTTP route streams them.
 */
export async function rpcAnswer(response: RouteResponse, protocol: RpcProtocol, mapper: ErrorMapper): Promise<unknown> {
  if (response.status >= FIRST_REFUSAL_STATUS) {
    throw protocol.refuse(refusalOf(response));
  }

  const { payload } = response;
  const onlyOverHttp = (what: string): Error => protocol.refuse(streamedRefusal(what, response, mapper));

  if (payload.kind === 'stream') {
    await closed(payload.stream);

    throw onlyOverHttp(response.body instanceof Readable ? 'a file' : 'a list read as it comes');
  }

  if (payload.kind === 'bytes') {
    if (!protocol.carriesBinary) {
      throw onlyOverHttp('a binary body');
    }

    return new Blob([payload.bytes], { type: response.headers['content-type'] });
  }

  return payload.kind === 'text' ? returned(payload.text, response) : undefined;
}

/** A file is closed, and so is the cursor of a list, whether anything was read from it or not. */
async function closed(stream: Readable): Promise<void> {
  stream.destroy();

  await finished(stream).catch(() => undefined);
}

/**
 * A JSON body is returned as the HTTP route writes it, a date as its text: what the contract, and
 * the client generated from it, say it is, which the serializer of a protocol would otherwise keep a `Date`.
 */
function returned(text: string, response: RouteResponse): unknown {
  return isJsonContentType(response.headers['content-type']) ? JSON.parse(text) : text;
}

/** A refusal the route answers itself, without a problem document, keeps its status and its body under the code `HTTP_<status>`. */
function refusalOf(response: RouteResponse): RpcRefusal {
  const { body, status } = response;

  if (!isProblem(body)) {
    const code = `HTTP_${String(status)}`;

    return { status, code, message: code, problem: undefined, body };
  }

  return { status, code: body.code, message: body.detail ?? body.title, problem: body, body };
}

function isProblem(body: unknown): body is Problem {
  return isRecord(body) && typeof body['code'] === 'string' && typeof body['title'] === 'string';
}

/** The problem the HTTP route would answer to an `Accept` it cannot meet, under the request id of the call. */
function streamedRefusal(what: string, response: RouteResponse, mapper: ErrorMapper): RpcRefusal {
  const message = `This operation answers ${what}, which only its HTTP route carries.`;
  const problem = toProblem(new NotAcceptableError(message), mapper, response.headers['x-request-id'] ?? '');

  return { status: problem.status, code: problem.code, message, problem, body: problem };
}
