import { loadedAt, type Clock, type ExecutionScope } from '@ddd-ts-kit/kernel';
import { saveTenantAggregate, tenantWhere, type TypeOrmContext } from '../../../../../src';
import { Invoice } from '../../domain/invoice';
import type { InvoiceRepository } from '../../domain/repositories/invoice.repository';
import { invoices } from './invoices';

/**
 * The repository a consuming project would write: no transaction in sight, every statement
 * confined to the tenant of the work in progress (`tenantWhere` to read, `saveTenantAggregate` to
 * write), audit columns stamped from its actor.
 */
export class TypeOrmInvoiceRepository implements InvoiceRepository {
  constructor(
    private readonly context: TypeOrmContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Invoice | undefined> {
    const row = await this.context.manager().findOneBy(invoices, { id, ...tenantWhere(this.scope) });

    if (row === null) {
      return undefined;
    }

    return loadedAt(Invoice.rehydrate(row), row.version);
  }

  async save(invoice: Invoice): Promise<void> {
    await saveTenantAggregate(this.context, invoices, {
      aggregate: invoice,
      row: invoice.state,
      scope: this.scope,
      clock: this.clock,
    });
  }
}
