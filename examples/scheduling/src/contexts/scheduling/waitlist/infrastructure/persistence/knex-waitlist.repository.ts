import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
import { Repository } from '@ddd-ts-kit/kernel/declarations';
import { KnexContext, saveTenantAggregate, tenantTable } from '@ddd-ts-kit/knex';
import type { Waitlist } from '@/contexts/scheduling/waitlist/domain/aggregates/waitlist.aggregate';
import { WaitlistRepository } from '@/contexts/scheduling/waitlist/domain/repositories/waitlist.repository';
import { SCHEDULING_SCHEMA } from '@/contexts/scheduling/shared/infrastructure/persistence/scheduling.schema';
import { WaitlistMapper } from '@/contexts/scheduling/waitlist/infrastructure/persistence/waitlist.mapper';
import type { WaitlistRow } from '@/contexts/scheduling/waitlist/infrastructure/persistence/waitlist-row.schema';

/** Tenant data: every statement reaches it through `tenantTable` or `saveTenantAggregate`, confined to the tenant of the work. */
const TABLE = { schema: SCHEDULING_SCHEMA, table: 'waitlists' };

@Repository(WaitlistRepository)
export class KnexWaitlistRepository implements WaitlistRepository {
  constructor(
    private readonly database: KnexContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Waitlist | undefined> {
    const row = await tenantTable<WaitlistRow>(this.database, this.scope, TABLE).where({ id }).first();

    return row === undefined ? undefined : WaitlistMapper.toDomain(row);
  }

  async save(saved: Waitlist): Promise<void> {
    await saveTenantAggregate(this.database, TABLE, {
      aggregate: saved,
      row: WaitlistMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}
