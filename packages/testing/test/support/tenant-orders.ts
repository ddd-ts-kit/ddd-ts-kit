import {
  loadedAt,
  optimisticUpdate,
  tenantReachOf,
  tenantScopeOf,
  type ExecutionScope,
  type Repository,
} from '@ddd-ts-kit/kernel';
import { Order, type OrderSnapshot } from './order';

interface StoredOrder {
  readonly tenantId: string;
  readonly snapshot: OrderSnapshot;
  readonly version: number;
}

/** A repository of shared storage that confines every read and write to the tenant of the work, as an adapter must. */
export class TenantOrders implements Repository<Order> {
  private readonly rows = new Map<string, StoredOrder>();

  constructor(private readonly scope: ExecutionScope) {}

  findById(id: string): Promise<Order | undefined> {
    const reach = tenantReachOf(this.scope);
    const row = this.rows.get(id);

    const reached =
      row !== undefined &&
      (reach.kind === 'tenant'
        ? row.tenantId === reach.tenantId
        : reach.tenants === 'all' || reach.tenants.includes(row.tenantId));

    if (!reached) {
      return Promise.resolve(undefined);
    }

    return Promise.resolve(loadedAt(Order.rehydrate(row.snapshot), row.version));
  }

  save(order: Order): Promise<void> {
    const { tenantId } = tenantScopeOf(this.scope);

    // No row written for an order that changed or belongs to another tenant: a ConcurrencyError.
    return optimisticUpdate(order, async ({ expected, next }) => {
      const row = this.rows.get(order.id);

      if (expected === 0 ? row !== undefined : row?.tenantId !== tenantId || row.version !== expected) {
        return 0;
      }

      this.rows.set(order.id, { tenantId, snapshot: order.toSnapshot(), version: next });

      return 1;
    });
  }
}
