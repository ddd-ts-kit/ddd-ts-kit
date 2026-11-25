import { and, eq } from 'drizzle-orm';
import { loadedAt, type Clock, type ExecutionScope } from '@ddd-ts-kit/kernel';
import { saveTenantAggregate } from '../../../../../src/postgres';
import type { Database } from '../../../platform/database/database';
import { Invoice } from '../../domain/invoice';
import type { InvoiceRepository } from '../../domain/repositories/invoice.repository';
import { invoices } from './invoices';
import { ownTenant } from './own-tenant';

/**
 * The repository a consuming project would write: no transaction in sight, every statement
 * scoped to the tenant of the work in progress, audit columns stamped from its actor.
 */
export class DrizzleInvoiceRepository implements InvoiceRepository {
  constructor(
    private readonly database: Database,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Invoice | undefined> {
    const [row] = await this.database
      .executor()
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), ownTenant(this.scope)));

    if (row === undefined) {
      return undefined;
    }

    return loadedAt(Invoice.rehydrate(row), row.version);
  }

  async save(invoice: Invoice): Promise<void> {
    await saveTenantAggregate(this.database, invoices, {
      aggregate: invoice,
      row: invoice.state,
      scope: this.scope,
      clock: this.clock,
    });
  }
}
