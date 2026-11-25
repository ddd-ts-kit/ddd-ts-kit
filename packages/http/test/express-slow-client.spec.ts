import type { AddressInfo } from 'node:net';
import express, { type Request } from 'express';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodSchema } from '@ddd-ts-kit/validation/zod';
import { until } from '@ddd-ts-kit/testing/e2e';
import { Representations, defineRoute, streamSchemaOf, type RequestContext } from '../src';
import { mountExpress } from '../src/express';

const CHUNKS = 40;
/** Larger than what a response buffers: every chunk makes the response ask the list to wait. */
const LINE = 'x'.repeat(256 * 1024);

interface Line {
  readonly line: string;
}

/** Serves `lines` as a list read as it comes, and calls `exchange` with its address. */
async function serving(
  lines: (context: RequestContext) => AsyncIterable<Line>,
  exchange: (url: string) => Promise<void>,
): Promise<void> {
  const exported = defineRoute(
    {
      method: 'GET',
      path: '/lines',
      operationId: 'exportLines',
      summary: 'Export the lines',
      responses: {
        200: { description: 'The lines.', body: streamSchemaOf(zodSchema(z.object({ line: z.string() }))) },
      },
      security: false,
    },
    ({ context }) => ({ status: 200, body: lines(context) }),
  );

  const app = express();

  mountExpress(app, [exported], { representations: Representations.standard() });
  const server = app.listen(0, '127.0.0.1');

  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await exchange(`http://127.0.0.1:${String(port)}/lines`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('a list read as it comes, on Express, to a client slower than the list', () => {
  it('waits for the client at each chunk without keeping a listener per pause', async () => {
    const listening: number[] = [];

    async function* lines({ raw }: RequestContext): AsyncIterable<Line> {
      for (let index = 0; index < CHUNKS; index += 1) {
        listening.push((raw as Request).res?.listenerCount('close') ?? 0);

        yield { line: LINE };
      }
    }

    await serving(lines, async (url) => {
      const response = await fetch(url);

      expect(((await response.json()) as unknown[]).length).toBe(CHUNKS);
    });

    // The first item is read before the status goes; from the second on, a pause leaves nothing behind.
    expect(Math.max(...listening)).toBe(listening[1]);
  });

  it('stops reading the list, and closes it, once the client has left', async () => {
    const read = { items: 0, closed: false };

    async function* lines(): AsyncIterable<Line> {
      try {
        for (;;) {
          read.items += 1;

          yield { line: LINE };
        }
      } finally {
        read.closed = true;
      }
    }

    await serving(lines, async (url) => {
      const leaving = new AbortController();
      const response = await fetch(url, { signal: leaving.signal });

      expect(response.status).toBe(200);
      leaving.abort();

      await until(() => read.closed, { timeoutMs: 2000, intervalMs: 10 });
    });

    expect(read.closed).toBe(true);
  });
});
