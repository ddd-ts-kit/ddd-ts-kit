import { saveAggregate } from '@ddd-ts-kit/prisma';
import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
import type { Member } from '{{alias.context}}/domain/aggregates/member.aggregate{{alias.ext}}';
{{#if style.declared}}
import { MemberRepository } from '{{alias.context}}/domain/repositories/member.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { MemberRepository } from '{{alias.context}}/domain/repositories/member.repository{{alias.ext}}';
{{/unless}}
import { MemberRole } from '{{alias.context}}/domain/vocabularies/member-role.vocabulary{{alias.ext}}';
import type { Database } from '{{alias.platform}}/database/database{{alias.ext}}';
import { MemberMapper } from '{{alias.context}}/infrastructure/persistence/member.mapper{{alias.ext}}';

{{#if style.declared}}
@Repository(MemberRepository)
{{/if}}
export class PrismaMemberRepository implements MemberRepository {
  constructor(
    private readonly database: Database,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Member | undefined> {
    const row = await membersOf(this.database).findUnique({ where: { id } });

    return row === null ? undefined : MemberMapper.toDomain(row);
  }

  async findOf(organisationId: string, accountId: string): Promise<Member | undefined> {
    const row = await membersOf(this.database).findFirst({ where: { organisationId, accountId, removedAt: null } });

    return row === null ? undefined : MemberMapper.toDomain(row);
  }

  async searchCurrentOf(accountId: string): Promise<readonly Member[]> {
    const rows = await membersOf(this.database).findMany({ where: { accountId, removedAt: null }, orderBy: { id: 'asc' } });

    return rows.map((row) => MemberMapper.toDomain(row));
  }

  countOwners(organisationId: string): Promise<number> {
    return membersOf(this.database).count({ where: { organisationId, role: MemberRole.Owner, removedAt: null } });
  }

  async save(saved: Member): Promise<void> {
    await saveAggregate(membersOf(this.database), {
      aggregate: saved,
      row: MemberMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}

/** The members on the client of the unit of work, which every statement of this file goes through. */
function membersOf(database: Database): ReturnType<Database['client']>['{{context.camel}}Member'] {
  return database.client().{{context.camel}}Member;
}
