import knex, { type Knex } from 'knex';
import { describe, expect, it } from 'vitest';
import { TenantDatabases } from '../src';

/** Without a connection knex loads no driver; this instance refuses to close, as a server that hung up makes one. */
function neverClosing(config: Knex.Config): Knex {
  const database = knex(config);
  const client: unknown = database.client;

  if (typeof client === 'object' && client !== null) {
    Object.assign(client, { destroy: () => Promise.reject(new Error('socket hang up')) });
  }

  return database;
}

const nothing = async (): Promise<void> => undefined;

describe('TenantDatabases and a pool that cannot be closed', () => {
  it('tells who wired it, and gives the place to the next tenant all the same', async () => {
    const failures: string[] = [];

    const databases = new TenantDatabases({
      connectionOf: () => ({ client: 'pg' }),
      maxTenants: 1,
      open: neverClosing,
      onCloseFailure: (error, tenantId) => failures.push(`${tenantId}: ${String(error)}`),
    });

    await databases.lease('acme', nothing);
    await databases.lease('globex', nothing);

    expect(failures).toEqual(['acme: Error: socket hang up']);
    expect(databases.tenants()).toEqual(['globex']);
  });

  it('leaves no rejection unhandled when nobody listens', async () => {
    const unhandled: unknown[] = [];
    const note = (reason: unknown): void => void unhandled.push(reason);

    const databases = new TenantDatabases({
      connectionOf: () => ({ client: 'pg' }),
      maxTenants: 1,
      open: neverClosing,
    });

    process.on('unhandledRejection', note);
    await databases.lease('acme', nothing);
    await databases.lease('globex', nothing);
    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off('unhandledRejection', note);

    expect(unhandled).toEqual([]);
  });
});
