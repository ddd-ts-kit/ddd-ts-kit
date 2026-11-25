import type { Payload } from './payload';

/** A payload a framework is handed whole: every one but a stream, which it pipes. */
type WholePayload = Exclude<Payload, { kind: 'stream' }>;

/** The whole of a payload, as every framework sends it: its text, its bytes, or nothing. */
export function wholeOf(payload: WholePayload): string | Uint8Array | undefined {
  if (payload.kind === 'none') {
    return undefined;
  }

  return payload.kind === 'text' ? payload.text : payload.bytes;
}
