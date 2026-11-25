import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { Payload } from '../src';
import { writtenText } from '../src/testing';

const answered = (payload: Payload) => writtenText({ status: 200, headers: {}, payload });

describe('the text an adapter writes for an answer', () => {
  it('is the text of the payload, or its bytes decoded', async () => {
    expect(await answered({ kind: 'text', text: '{"id":1}' })).toBe('{"id":1}');
    expect(await answered({ kind: 'bytes', bytes: new TextEncoder().encode('café') })).toBe('café');
  });

  it('is every chunk of a stream, read to its end, and empty when nothing is written', async () => {
    expect(await answered({ kind: 'stream', stream: Readable.from(['[', '{"id":1}', ']']) })).toBe('[{"id":1}]');
    expect(await answered({ kind: 'none' })).toBe('');
  });
});
