import { text } from 'node:stream/consumers';
import { wholeOf } from '../pipeline/whole-of';
import type { RouteResponse } from '../pipeline/route-response';

/**
 * The text an adapter writes for an answer, read to its end: what a spec checks a representation
 * with (XML, CSV), or a list read as it comes, where `response.body` is the value before it was
 * written.
 *
 *     expect(await writtenText(await send({ headers: { accept: 'text/csv' } }))).toBe('id\r\n1\r\n');
 */
export async function writtenText({ payload }: RouteResponse): Promise<string> {
  if (payload.kind === 'stream') {
    return text(payload.stream);
  }

  const whole = wholeOf(payload) ?? '';

  return typeof whole === 'string' ? whole : new TextDecoder().decode(whole);
}
