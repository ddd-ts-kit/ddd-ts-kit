import { saveAggregate } from '@ddd-ts-kit/prisma';
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
import { InvitationMapper } from '{{alias.context}}/infrastructure/persistence/invitation.mapper{{alias.ext}}';

{{#if style.declared}}
@Repository(InvitationRepository)
{{/if}}
export class PrismaInvitationRepository implements InvitationRepository {
  constructor(
    private readonly database: Database,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Invitation | undefined> {
    const row = await invitationsOf(this.database).findUnique({ where: { id } });

    return row === null ? undefined : InvitationMapper.toDomain(row);
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | undefined> {
    const row = await invitationsOf(this.database).findUnique({ where: { tokenHash } });

    return row === null ? undefined : InvitationMapper.toDomain(row);
  }

  async save(saved: Invitation): Promise<void> {
    await saveAggregate(invitationsOf(this.database), {
      aggregate: saved,
      row: InvitationMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}

/** The invitations on the client of the unit of work, which every statement of this file goes through. */
function invitationsOf(database: Database): ReturnType<Database['client']>['{{context.camel}}Invitation'] {
  return database.client().{{context.camel}}Invitation;
}
