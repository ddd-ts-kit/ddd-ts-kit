import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
import { Repository } from '@ddd-ts-kit/kernel/declarations';
import { KnexContext, saveTenantAggregate, tenantTable } from '@ddd-ts-kit/knex';
import type { Practice } from '@/contexts/identity/domain/aggregates/practice.aggregate';
import { PracticeRepository } from '@/contexts/identity/domain/repositories/practice.repository';
import { IDENTITY_SCHEMA } from '@/contexts/identity/infrastructure/persistence/identity.schema';
import { PracticeMapper } from '@/contexts/identity/infrastructure/persistence/practice.mapper';
import type { PracticeRow } from '@/contexts/identity/infrastructure/persistence/practice-row.schema';

/** Tenant data: every statement reaches it through `tenantTable` or `saveTenantAggregate`, confined to the tenant of the work. */
const TABLE = { schema: IDENTITY_SCHEMA, table: 'practices' };

@Repository(PracticeRepository)
export class KnexPracticeRepository implements PracticeRepository {
  constructor(
    private readonly database: KnexContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Practice | undefined> {
    const row = await tenantTable<PracticeRow>(this.database, this.scope, TABLE).where({ id }).first();

    return row === undefined ? undefined : PracticeMapper.toDomain(row);
  }

  async save(saved: Practice): Promise<void> {
    await saveTenantAggregate(this.database, TABLE, {
      aggregate: saved,
      row: PracticeMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}
