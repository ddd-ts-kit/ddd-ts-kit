import { loadedAt, type Clock, type ExecutionScope } from '@ddd-ts-kit/kernel';
import { saveTenantAggregate, tenantWhere } from '../../../../../src';
import type { Database } from '../../../platform/database/database';
import { Invoice } from '../../domain/invoice';
import type { InvoiceRepository } from '../../domain/repositories/invoice.repository';
import { statusOf } from './status-of';

/**
 * The repository a consuming project would write: no transaction in sight, every statement
 * confined to the tenant of the work in progress through the helpers (`tenantWhere` to read,
 * `ownTenantWhere` to update, `tenantScopeOf` on the inserted row), audit columns stamped from
 * its actor.
 */
export class PrismaInvoiceRepository implements InvoiceRepository {
  constructor(
    private readonly database: Database,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Invoice | undefined> {
    // findFirst, not findUnique: the tenant is part of every condition, and it is not part of the key.
    const row = await this.database.client().invoice.findFirst({ where: { id, ...tenantWhere(this.scope) } });

    if (row === null) {
      return undefined;
    }

    return loadedAt(Invoice.rehydrate({ ...row, status: statusOf(row.status) }), row.version);
  }

  async save(invoice: Invoice): Promise<void> {
    await saveTenantAggregate(this.database.client().invoice, {
      aggregate: invoice,
      row: invoice.state,
      scope: this.scope,
      clock: this.clock,
    });
  }
}
