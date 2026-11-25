import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AsyncLocalStorageExecutionScope,
  ConcurrencyError,
  NoCurrentTenantError,
  executionContext,
  systemActor,
  type ExecutionScope,
  type Repository,
} from '@ddd-ts-kit/kernel';
import { InMemoryRepository, anExecutionContext, asTenant, oneTenantScope, scoped, snapshots } from '../src';
import { repositoryContract, tenantIsolationContract } from '../src/contracts';
import { CollectingRunner } from './support/collecting-runner';
import { Order, at } from './support/order';
import { TenantOrders } from './support/tenant-orders';

const runner = { describe, it, expect, beforeEach, afterEach };
let next = 0;

const orders = {
  createAggregate: () =>
    Order.place(`order-${(next += 1)}`, { id: 'c-1', name: 'Ada' }, [{ sku: 'a', quantity: 1 }], at),
  mutate: (order: Order) => order.addLine({ sku: 'c', quantity: 3 }, at),
  idOf: (order: Order) => order.id,
  stateOf: (order: Order) => order.toSnapshot(),
};

tenantIsolationContract<Order>(runner, {
  ...orders,
  name: 'in memory, shared storage confined by the tenant of the work',
  recreate: (order: Order) => Order.place(order.id, { id: 'c-2', name: 'Bob' }, [{ sku: 'b', quantity: 2 }], at),
  elevatedReads: true,
  createRepository: (scope) => new TenantOrders(scope),
});

tenantIsolationContract<Order>(runner, {
  ...orders,
  name: 'in memory, without the inserts and the reads of an elevation',
  createRepository: (scope) => new TenantOrders(scope),
});

/** The fake of a tenant-scoped aggregate, as the generator writes it. */
class FakeOrders extends InMemoryRepository<Order> {
  constructor(scope: ExecutionScope = oneTenantScope()) {
    super(snapshots({ toSnapshot: (order) => order.toSnapshot(), fromSnapshot: Order.rehydrate }), {
      confinedTo: scope,
    });
  }

  /** What a port with a removal method gives the application. */
  delete(id: string): boolean {
    return this.remove(id);
  }
}

tenantIsolationContract<Order>(runner, {
  ...orders,
  name: 'InMemoryRepository confined to a scope',
  recreate: (order: Order) => Order.place(order.id, { id: 'c-2', name: 'Bob' }, [{ sku: 'b', quantity: 2 }], at),
  elevatedReads: true,
  createRepository: (scope) => new FakeOrders(scope),
});

repositoryContract<Order>(runner, {
  ...orders,
  name: 'InMemoryRepository confined to one tenant',
  createRepository: () => new FakeOrders(),
});

describe('InMemoryRepository confined to a scope', () => {
  const scope = new AsyncLocalStorageExecutionScope();

  it('answers a tenant what it saved only, through all and count as through findById', async () => {
    const repository = new FakeOrders(scope);
    const ofAcme = orders.createAggregate();

    await asTenant(scope, 'acme', () => repository.save(ofAcme));
    await asTenant(scope, 'globex', () => repository.save(orders.createAggregate()));

    expect(asTenant(scope, 'acme', () => repository.all().map((order) => order.id))).toEqual([ofAcme.id]);
    expect(asTenant(scope, 'acme', () => repository.count())).toBe(1);
  });

  it('answers an elevation the tenants it names, and every tenant when it names all', async () => {
    const repository = new FakeOrders(scope);

    await asTenant(scope, 'acme', () => repository.save(orders.createAggregate()));
    await asTenant(scope, 'globex', () => repository.save(orders.createAggregate()));

    expect(scoped(scope, anExecutionContext().elevatedOver(['globex']), () => repository.count())).toBe(1);
    expect(scoped(scope, anExecutionContext().elevatedOver('all'), () => repository.count())).toBe(2);
  });

  it('refuses the save of a tenant under the id another holds as it refuses a stale one', async () => {
    const repository = new FakeOrders(scope);
    const saved = orders.createAggregate();

    await asTenant(scope, 'acme', () => repository.save(saved));

    await expect(asTenant(scope, 'globex', () => repository.save(saved))).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('removes for a tenant what it holds, and nothing of another', async () => {
    const repository = new FakeOrders(scope);
    const saved = orders.createAggregate();

    await asTenant(scope, 'acme', () => repository.save(saved));

    expect(asTenant(scope, 'globex', () => repository.delete(saved.id))).toBe(false);
    expect(asTenant(scope, 'acme', () => repository.delete(saved.id))).toBe(true);
    expect(asTenant(scope, 'acme', () => repository.count())).toBe(0);
  });

  it('shows nothing to work that names no tenant', () => {
    const repository = new FakeOrders(scope);
    const job = executionContext({ correlationId: 'no-tenant', actor: systemActor('job'), origin: 'test' });

    expect(() => scope.run(job, () => repository.all())).toThrow(NoCurrentTenantError);
  });

  it('forgets every tenant when it is cleared', async () => {
    const repository = new FakeOrders(scope);

    await asTenant(scope, 'acme', () => repository.save(orders.createAggregate()));
    repository.clear();

    expect(scoped(scope, anExecutionContext().elevatedOver('all'), () => repository.count())).toBe(0);
  });
});

describe('oneTenantScope', () => {
  it('is the work of a member of acme, or of the tenant it is given', () => {
    expect(oneTenantScope().require().tenantId).toBe('acme');
    expect(oneTenantScope('globex').require().actor.tenantId).toBe('globex');
  });

  it('lets a spec change tenant for a block', async () => {
    const scope = oneTenantScope();
    const repository = new FakeOrders(scope);
    const saved = orders.createAggregate();

    await repository.save(saved);

    expect(await asTenant(scope, 'globex', () => repository.findById(saved.id))).toBeUndefined();
    expect(await repository.findById(saved.id)).toBeDefined();
  });
});

describe('the tenant isolation contract given no mutate', () => {
  it('leaves the save under a held id pending, and runs the rest', async () => {
    const collecting = new CollectingRunner();
    const { mutate: _left, ...unchanging } = orders;

    tenantIsolationContract<Order>(collecting, {
      ...unchanging,
      name: 'without mutate',
      elevatedReads: true,
      createRepository: (scope) => new FakeOrders(scope),
    });

    const { failed, passed } = await collecting.run();

    expect(failed).toEqual([]);
    expect(passed).toHaveLength(3);

    expect(collecting.pending).toEqual([
      'leaves untouched what a tenant saved when another saves under the same id (give the contract a mutate that records a change of state)',
    ]);
  });
});

/** Row-level security alone: the database shows nothing to work that names no tenant, and refuses its writes. */
class RowLevelSecurityOrders extends TenantOrders {
  override findById(id: string): Promise<Order | undefined> {
    return Promise.resolve()
      .then(() => super.findById(id))
      .catch((error: unknown) => (error instanceof NoCurrentTenantError ? undefined : Promise.reject(error)));
  }
}

tenantIsolationContract<Order>(runner, {
  ...orders,
  name: 'in memory, under row-level security alone',
  elevatedReads: true,
  createRepository: (scope) => new RowLevelSecurityOrders(scope),
});

/** A repository that takes every save and finds nothing back. */
class ForgetfulOrders implements Repository<Order> {
  async findById(): Promise<Order | undefined> {
    return undefined;
  }

  async save(): Promise<void> {
    return undefined;
  }
}

describe('the tenant isolation contract and a repository that keeps nothing', () => {
  it.each([true, false])(
    'fails it on every test, with or without the reads of an elevation (%s)',
    async (elevatedReads) => {
      const collecting = new CollectingRunner();

      tenantIsolationContract<Order>(collecting, {
        ...orders,
        name: 'forgetful',
        recreate: (order: Order) => Order.place(order.id, { id: 'c-2', name: 'Bob' }, [{ sku: 'b', quantity: 2 }], at),
        elevatedReads,
        createRepository: () => new ForgetfulOrders(),
      });

      const { failed, passed } = await collecting.run();

      expect(failed).toEqual([
        'hides from a tenant what another tenant saved, and keeps it for its owner',
        'leaves untouched what a tenant saved when another saves under the same id',
        'leaves untouched what a tenant saved when another inserts a new aggregate under its id',
        'lets an elevation read what it reaches when the strategy allows it, and write nothing',
        'refuses a write of work that names no tenant, and shows it nothing',
      ]);

      expect(passed).toEqual([]);
    },
  );
});

describe('asTenant', () => {
  it('runs work as a member of the tenant, in that tenant', async () => {
    const scope = new AsyncLocalStorageExecutionScope();

    const context = await asTenant(scope, 'acme', async () => scope.require());

    expect(context.tenantId).toBe('acme');
    expect(context.actor.tenantId).toBe('acme');
  });

  it('opens an elevation over tenants, as acrossTenants would, for a spec', () => {
    expect(anExecutionContext().elevatedOver(['acme']).build().elevation).toEqual({
      reason: 'TEST',
      tenants: ['acme'],
    });
  });
});
