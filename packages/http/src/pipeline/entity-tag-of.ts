import type { EntityTagSource } from '../cache/entity-tag-source';
import { ResponseContractError } from '../error/response-contract-error';
import { valuesAt } from '../support/values-at';
import type { Payload } from './payload';
import { wholeOf } from './whole-of';

/**
 * The `ETag` of an answer: strong, the SHA-256 of the bytes sent, for `representation`; weak,
 * the version the value answered carries, for `{ version }`, the same in every representation.
 * A value without that version is an answer its declaration does not allow. A stream, a file or a
 * list read as it comes, has no strong one: its bytes are not known when its headers go.
 */
export async function entityTagOf(
  source: EntityTagSource,
  payload: Payload,
  value: unknown,
): Promise<string | undefined> {
  if (source === 'representation') {
    return payload.kind === 'stream' ? undefined : `"${await digestOf(wholeOf(payload) ?? '')}"`;
  }

  const [version] = valuesAt(value, source.version);

  if (typeof version !== 'number' && typeof version !== 'string') {
    throw new ResponseContractError(`The answer carries no version under "${source.version}" for its ETag.`);
  }

  return `W/"${version}"`;
}

async function digestOf(sent: string | Uint8Array): Promise<string> {
  const bytes = typeof sent === 'string' ? new TextEncoder().encode(sent) : sent;
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  const base64 = btoa(String.fromCharCode(...digest));

  return base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
