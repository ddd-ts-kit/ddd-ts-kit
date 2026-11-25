import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodSchema } from '@ddd-ts-kit/validation/zod';
import { CacheScope, defineRoute, type ErrorContext, type Route } from '../../src';
import type { RunningServer, StartServer } from './running-server';

const anything = zodSchema(z.unknown(), { io: 'output' });

function ledgerRoute(name: string, answered: () => unknown): Route {
  return defineRoute(
    {
      method: 'GET',
      path: `/ledger/${name}`,
      operationId: `readLedger-${name}`,
      summary: 'Read the ledger',
      responses: { 200: { description: 'The ledger.', body: anything } },
      security: false,
      cache: { scope: CacheScope.private, maxAge: '1m' },
    },
    () => ({ status: 200, body: answered() }),
  );
}

/** An entry that names itself: a value JSON cannot write. */
function loop(): unknown {
  const entry: Record<string, unknown> = { id: 'entry-1' };

  entry['next'] = entry;

  return entry;
}

/** A value that cannot be written is an error of the route, on every framework: nothing is left to serialize once the pipeline answered. */
export function refusesWhatCannotBeWritten(start: StartServer): void {
  describe('with an answer JSON does not write as it is', () => {
    const reported: ErrorContext[] = [];
    let server: RunningServer;

    beforeAll(async () => {
      server = await start([ledgerRoute('total', () => ({ total: 10n })), ledgerRoute('loop', loop)], {
        onError: (_error, context) => reported.push(context),
      });
    });

    afterAll(async () => {
      await server.close();
    });

    it('writes a big integer as its text, as in a list read as it comes', async () => {
      const response = await fetch(`${server.url}/ledger/total`);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('{"total":"10"}');
    });

    it('answers 500 as a problem nobody keeps, and tells the error hook, when the value cannot be written', async () => {
      reported.length = 0;
      const response = await fetch(`${server.url}/ledger/loop`);

      expect(response.status).toBe(500);
      expect(response.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
      expect(reported).toHaveLength(1);
      expect(reported[0]).toMatchObject({ operationId: 'readLedger-loop', problem: { status: 500 } });
    });
  });
}
