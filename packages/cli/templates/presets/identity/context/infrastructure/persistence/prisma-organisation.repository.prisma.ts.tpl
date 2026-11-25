import { saveAggregate } from '@ddd-ts-kit/prisma';
import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
import type { Organisation } from '{{alias.context}}/domain/aggregates/organisation.aggregate{{alias.ext}}';
{{#if style.declared}}
import { OrganisationRepository } from '{{alias.context}}/domain/repositories/organisation.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { OrganisationRepository } from '{{alias.context}}/domain/repositories/organisation.repository{{alias.ext}}';
{{/unless}}
import type { Database } from '{{alias.platform}}/database/database{{alias.ext}}';
import { OrganisationMapper } from '{{alias.context}}/infrastructure/persistence/organisation.mapper{{alias.ext}}';

{{#if style.declared}}
@Repository(OrganisationRepository)
{{/if}}
export class PrismaOrganisationRepository implements OrganisationRepository {
  constructor(
    private readonly database: Database,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Organisation | undefined> {
    const row = await organisationsOf(this.database).findUnique({ where: { id } });

    return row === null ? undefined : OrganisationMapper.toDomain(row);
  }

  async save(saved: Organisation): Promise<void> {
    await saveAggregate(organisationsOf(this.database), {
      aggregate: saved,
      row: OrganisationMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}

/** The organisations on the client of the unit of work, which every statement of this file goes through. */
function organisationsOf(database: Database): ReturnType<Database['client']>['{{context.camel}}Organisation'] {
  return database.client().{{context.camel}}Organisation;
}
