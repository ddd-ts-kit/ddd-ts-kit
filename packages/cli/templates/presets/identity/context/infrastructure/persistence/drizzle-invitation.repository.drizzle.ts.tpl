import { eq } from 'drizzle-orm';
import { saveAggregate } from '@ddd-ts-kit/drizzle/postgres';
import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
import type { Invitation } from '{{alias.context}}/domain/aggregates/invitation.aggregate{{alias.ext}}';
{{#if style.declared}}
import { InvitationRepository } from '{{alias.context}}/domain/repositories/invitation.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { InvitationRepository } from '{{alias.context}}/domain/repositories/invitation.repository{{alias.ext}}';
{{/unless}}
import type { Database } from '{{alias.platform}}/database/database{{alias.ext}}';
import { invitations } from '{{alias.context}}/infrastructure/persistence/{{context.kebab}}.schema{{alias.ext}}';
import { InvitationMapper } from '{{alias.context}}/infrastructure/persistence/invitation.mapper{{alias.ext}}';

{{#if style.declared}}
@Repository(InvitationRepository)
{{/if}}
export class DrizzleInvitationRepository implements InvitationRepository {
  constructor(
    private readonly database: Database,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Invitation | undefined> {
    const [row] = await executorOf(this.database).select().from(invitations).where(eq(invitations.id, id));

    return row === undefined ? undefined : InvitationMapper.toDomain(row);
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | undefined> {
    const [row] = await executorOf(this.database).select().from(invitations).where(eq(invitations.tokenHash, tokenHash));

    return row === undefined ? undefined : InvitationMapper.toDomain(row);
  }

  async save(saved: Invitation): Promise<void> {
    await saveAggregate(this.database, invitations, {
      aggregate: saved,
      row: InvitationMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}

/** The executor of the unit of work, which every statement of this file goes through. */
function executorOf(database: Database): ReturnType<Database['executor']> {
  return database.executor();
}
