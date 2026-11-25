import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodSchema } from '@ddd-ts-kit/validation/zod';
import { defineRoute, executeRoute } from '../src';

function answering(body: unknown, headers?: Record<string, string>) {
  return defineRoute(
    {
      method: 'GET',
      path: '/answer',
      operationId: 'answer',
      summary: 'Answer',
      responses: { 200: { description: 'Answered.', body: zodSchema(z.unknown(), { io: 'output' }) } },
      security: false,
    },
    () => ({ status: 200, body, ...(headers === undefined ? {} : { headers }) }),
  );
}

const asked = { params: {}, query: {}, headers: {}, body: undefined, raw: null };

describe('the payload of an answer, decided before any adapter writes it', () => {
  it('is nothing when there is no body, and the answer names no content type', async () => {
    const response = await executeRoute(answering(undefined), asked);

    expect(response.payload).toEqual({ kind: 'none' });
    expect(response.headers['content-type']).toBeUndefined();
  });

  it('is JSON text by default, strings included, beside the value answered', async () => {
    const response = await executeRoute(answering({ a: 1 }), asked);

    expect(response).toMatchObject({ payload: { kind: 'text', text: '{"a":1}' }, body: { a: 1 } });
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect((await executeRoute(answering('text'), asked)).payload).toEqual({ kind: 'text', text: '"text"' });
  });

  it('is a string as it is under a content type chosen by the handler, unless that one is JSON', async () => {
    const csv = await executeRoute(answering('a;b', { 'Content-Type': 'text/csv' }), asked);
    const json = await executeRoute(answering('a;b', { 'content-type': 'application/vnd.note+json' }), asked);

    expect(csv).toMatchObject({ payload: { kind: 'text', text: 'a;b' }, headers: { 'content-type': 'text/csv' } });
    expect(json.payload).toEqual({ kind: 'text', text: '"a;b"' });
  });

  it('is bytes as they are, under application/octet-stream unless the handler says otherwise', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const response = await executeRoute(answering(bytes), asked);

    expect(response.payload).toEqual({ kind: 'bytes', bytes });
    expect(response.headers['content-type']).toBe('application/octet-stream');
  });

  it('refuses, as a fault told to the error hook, a value JSON has no text for', async () => {
    const reported: unknown[] = [];

    const response = await executeRoute(
      answering(() => 'never written'),
      asked,
      {
        onError: (error) => reported.push(error),
      },
    );

    expect(response).toMatchObject({ status: 500, body: { code: 'INTERNAL_ERROR' } });
    expect(reported).toEqual([new TypeError('The answer is a value JSON does not write.')]);
  });
});

describe('withPrincipal', () => {
  it('runs the handler inside the scope opened for the resolved principal', async () => {
    const scope = new AsyncLocalStorage<unknown>();
    const request = { params: {}, query: {}, headers: {}, body: undefined, raw: undefined };

    const route = defineRoute(
      {
        method: 'GET',
        path: '/me',
        operationId: 'whoAmI',
        summary: 'Who am I',
        security: ['bearer'],
        responses: {
          200: { description: 'The caller.', body: zodSchema(z.object({ id: z.string() }), { io: 'output' }) },
        },
      },
      async () => ({ status: 200, body: { id: String(scope.getStore()) } }),
    );

    const response = await executeRoute(route, request, {
      resolvePrincipal: () => 'ada',
      withPrincipal: (principal, work) => scope.run(principal, work),
    });

    expect(response.body).toEqual({ id: 'ada' });
  });
});
