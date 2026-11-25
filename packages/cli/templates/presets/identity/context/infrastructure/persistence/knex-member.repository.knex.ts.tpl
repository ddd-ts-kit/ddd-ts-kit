import type { Knex } from 'knex';
import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
import { type KnexContext, saveAggregate } from '@ddd-ts-kit/knex';
import type { Member } from '{{alias.context}}/domain/aggregates/member.aggregate{{alias.ext}}';
{{#if style.declared}}
import { MemberRepository } from '{{alias.context}}/domain/repositories/member.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { MemberRepository } from '{{alias.context}}/domain/repositories/member.repository{{alias.ext}}';
{{/unless}}
import { MemberRole } from '{{alias.context}}/domain/vocabularies/member-role.vocabulary{{alias.ext}}';
import { {{context.constant}}_SCHEMA } from '{{alias.context}}/infrastructure/persistence/{{context.kebab}}.schema{{alias.ext}}';
import { MemberMapper } from '{{alias.context}}/infrastructure/persistence/member.mapper{{alias.ext}}';
import type { MemberRow } from '{{alias.context}}/infrastructure/persistence/member-row.schema{{alias.ext}}';

const TABLE = { schema: {{context.constant}}_SCHEMA, table: 'members' };

{{#if style.declared}}
@Repository(MemberRepository)
{{/if}}
export class KnexMemberRepository implements MemberRepository {
  constructor(
    private readonly database: KnexContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Member | undefined> {
    const row = await tableOf(this.database).where({ id }).first();

    return row === undefined ? undefined : MemberMapper.toDomain(row);
  }

  async findOf(organisationId: string, accountId: string): Promise<Member | undefined> {
    const current = { organisation_id: organisationId, account_id: accountId };
    const row = await tableOf(this.database).where(current).whereNull('removed_at').first();

    return row === undefined ? undefined : MemberMapper.toDomain(row);
  }

  async searchCurrentOf(accountId: string): Promise<readonly Member[]> {
    const rows = await tableOf(this.database).where({ account_id: accountId }).whereNull('removed_at').orderBy('id');

    return rows.map((row) => MemberMapper.toDomain(row));
  }

  async countOwners(organisationId: string): Promise<number> {
    const owners = { organisation_id: organisationId, role: MemberRole.Owner };
    const counted = await tableOf(this.database).where(owners).whereNull('removed_at').count({ total: '*' }).first();

    return Number(counted?.total ?? 0);
  }

  async save(saved: Member): Promise<void> {
    await saveAggregate(this.database, TABLE, {
      aggregate: saved,
      row: MemberMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}

/** A function and not a method: a query builder is thenable, and a method that answers one is read as asynchronous by whatever wraps the adapter (tracing), which then answers a promise. */
function tableOf(database: KnexContext): Knex.QueryBuilder<MemberRow, MemberRow[]> {
  const table = database.executor()<MemberRow, MemberRow[]>('members');

  return table.withSchema({{context.constant}}_SCHEMA);
}
