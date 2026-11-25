import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
import { Repository } from '@ddd-ts-kit/kernel/declarations';
import { KnexContext, saveTenantAggregate, tenantTable } from '@ddd-ts-kit/knex';
import type { Delegation } from '@/contexts/identity/domain/aggregates/delegation.aggregate';
import type { Desk } from '@/contexts/identity/domain/value-objects/desk.vo';
import { DelegationRepository } from '@/contexts/identity/domain/repositories/delegation.repository';
import { IDENTITY_SCHEMA } from '@/contexts/identity/infrastructure/persistence/identity.schema';
import { DelegationMapper } from '@/contexts/identity/infrastructure/persistence/delegation.mapper';
import type { DelegationRow } from '@/contexts/identity/infrastructure/persistence/delegation-row.schema';

/** Tenant data: every statement reaches it through `tenantTable` or `saveTenantAggregate`, confined to the tenant of the work. */
const TABLE = { schema: IDENTITY_SCHEMA, table: 'delegations' };

@Repository(DelegationRepository)
export class KnexDelegationRepository implements DelegationRepository {
  constructor(
    private readonly database: KnexContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Delegation | undefined> {
    const row = await tenantTable<DelegationRow>(this.database, this.scope, TABLE).where({ id }).first();

    return row === undefined ? undefined : DelegationMapper.toDomain(row);
  }

  async findActiveBetween(desk: Desk, assistantId: string): Promise<Delegation | undefined> {
    const row = await tenantTable<DelegationRow>(this.database, this.scope, TABLE)
      .where({ practice_id: desk.practiceId, practitioner_id: desk.practitionerId, assistant_id: assistantId })
      .whereNull('ended_at')
      .first();

    return row === undefined ? undefined : DelegationMapper.toDomain(row);
  }

  async findActiveOfMember(practiceId: string, personId: string): Promise<readonly Delegation[]> {
    const rows = await tenantTable<DelegationRow>(this.database, this.scope, TABLE)
      .where({ practice_id: practiceId })
      .whereNull('ended_at')
      .where((either) => {
        void either.where({ practitioner_id: personId }).orWhere({ assistant_id: personId });
      })
      .orderBy('id');

    return rows.map((row) => DelegationMapper.toDomain(row));
  }

  async findDueAt(instant: Date): Promise<readonly Delegation[]> {
    const rows = await tenantTable<DelegationRow>(this.database, this.scope, TABLE)
      .whereNull('ended_at')
      .where('ends_at', '<=', instant)
      .orderBy('id');

    return rows.map((row) => DelegationMapper.toDomain(row));
  }

  async save(saved: Delegation): Promise<void> {
    await saveTenantAggregate(this.database, TABLE, {
      aggregate: saved,
      row: DelegationMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}
