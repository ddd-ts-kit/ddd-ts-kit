import 'reflect-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryLogger } from '@ddd-ts-kit/kernel';
import { nestOver, startExpress, startFastify, startHono } from './support/edge-servers';
import type { RunningServer } from './support/running-server';

let running: RunningServer | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

describe.each([
  ['Express', startExpress],
  ['Fastify', startFastify],
  ['Hono', startHono],
  ['Nest over Express', nestOver('express')],
  ['Nest over Fastify', nestOver('fastify')],
] as const)('a middleware in front of the routes of %s that refuses with an error of the kit', (_name, start) => {
  it('is answered as a route answers that refusal, under the status of its code, and logged as a warning', async () => {
    const logger = new InMemoryLogger();

    running = await start(logger);

    const response = await fetch(`${running.url}/expired`, { headers: { 'x-request-id': 'req-5' } });

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');

    expect(await response.json()).toEqual({
      type: 'urn:problem:unauthorized',
      title: 'Unauthorized',
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'The token has expired.',
      requestId: 'req-5',
    });

    expect(logger.entries).toEqual([
      {
        level: 'warn',
        message: 'request refused before its route',
        fields: { errorType: 'UNAUTHORIZED', status: 401, requestId: 'req-5' },
      },
    ]);
  });
});
