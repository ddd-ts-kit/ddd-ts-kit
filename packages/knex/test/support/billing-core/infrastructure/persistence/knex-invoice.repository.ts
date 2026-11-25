import { loadedAt, tenantScopeOf, type Clock, type ExecutionScope } from '@ddd-ts-kit/kernel';
import { jsonColumn, saveTenantAggregate, tenantRow, type KnexContext, type TenantRow } from '../../../../../src';
import { Invoice } from '../../domain/invoice';
import type { InvoiceRepository } from '../../domain/repositories/invoice.repository';
import { BILLING } from './billing-schema';
import { invoicesOf } from './invoices-of';

const INVOICES = { schema: BILLING, table: 'invoices' };

/**
 * The repository a consuming project would write: no transaction in sight, every statement
 * scoped to the tenant of the work in progress, audit columns stamped from its actor.
 */
export class KnexInvoiceRepository implements InvoiceRepository {
  constructor(
    private readonly context: KnexContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Invoice | undefined> {
    const row = await invoicesOf(this.context)
      .where({ id, ...this.ownTenant() })
      .first();

    if (row === undefined) {
      return undefined;
    }

    return loadedAt(Invoice.rehydrate(row), row.version);
  }

  async save(invoice: Invoice): Promise<void> {
    const { details, ...columns } = invoice.state;

    await saveTenantAggregate(this.context, INVOICES, {
      aggregate: invoice,
      row: { ...columns, ...(details === undefined ? {} : { details: jsonColumn(details) }) },
      scope: this.scope,
      clock: this.clock,
    });
  }

  private ownTenant(): TenantRow {
    return tenantRow(tenantScopeOf(this.scope));
  }
}
