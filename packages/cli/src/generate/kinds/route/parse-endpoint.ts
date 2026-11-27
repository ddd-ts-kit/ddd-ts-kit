import { isOneOf } from '../../../config';
import { CliError } from '../../../cli-error';
import type { Endpoint } from './endpoint';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const ROUTE_PATH = /^\/$|^(\/(:[A-Za-z_][A-Za-z0-9_]*|[A-Za-z0-9._~-]+))+$/;

/** The method and the path of a route, as `--method` and `--path` give them. */
export interface AskedEndpoint {
  readonly method: string | undefined;
  readonly path: string | undefined;
}

export function parseEndpoint({ method: asked, path }: AskedEndpoint): Endpoint {
  const method = asked?.toUpperCase();

  if (!isOneOf(METHODS, method)) {
    throw new CliError(
      asked === undefined ? 'A route needs --method.' : `Unknown method "${asked}".`,
      `Pass --method with one of: ${METHODS.join(', ')}.`,
    );
  }

  if (path === undefined || !ROUTE_PATH.test(path)) {
    throw new CliError(
      path === undefined ? 'A route needs --path.' : `"${path}" is not a valid route path.`,
      'Pass --path made of literal segments and ":name" parameters, for example /invoices/:invoiceId.',
    );
  }

  return { method, path, parameters: [...path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1] ?? '') };
}
