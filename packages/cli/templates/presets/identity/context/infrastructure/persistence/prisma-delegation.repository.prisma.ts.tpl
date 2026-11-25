import { saveAggregate } from '@ddd-ts-kit/prisma';
import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
import type { Delegation } from '{{alias.context}}/domain/aggregates/delegation.aggregate{{alias.ext}}';
{{#if style.declared}}
import { DelegationRepository } from '{{alias.context}}/domain/repositories/delegation.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { DelegationRepository } from '{{alias.context}}/domain/repositories/delegation.repository{{alias.ext}}';
{{/unless}}
import type { Database } from '{{alias.platform}}/database/database{{alias.ext}}';
import { DelegationMapper } from '{{alias.context}}/infrastructure/persistence/delegation.mapper{{alias.ext}}';

{{#if style.declared}}
@Repository(DelegationRepository)
{{/if}}
export class PrismaDelegationRepository implements DelegationRepository {
  constructor(
    private readonly database: Database,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Delegation | undefined> {
    const row = await delegationsOf(this.database).findUnique({ where: { id } });

    return row === null ? undefined : DelegationMapper.toDomain(row);
  }

  async findUnendedTo(organisationId: string, delegateId: string): Promise<readonly Delegation[]> {
    const rows = await delegationsOf(this.database).findMany({
      where: { organisationId, delegateId, endedAt: null },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => DelegationMapper.toDomain(row));
  }

  async findUnendedInvolving(organisationId: string, accountId: string): Promise<readonly Delegation[]> {
    const rows = await delegationsOf(this.database).findMany({
      where: { organisationId, endedAt: null, OR: [{ delegatorId: accountId }, { delegateId: accountId }] },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => DelegationMapper.toDomain(row));
  }

  async save(saved: Delegation): Promise<void> {
    await saveAggregate(delegationsOf(this.database), {
      aggregate: saved,
      row: DelegationMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}

/** The delegations on the client of the unit of work, which every statement of this file goes through. */
function delegationsOf(database: Database): ReturnType<Database['client']>['{{context.camel}}Delegation'] {
  return database.client().{{context.camel}}Delegation;
}
