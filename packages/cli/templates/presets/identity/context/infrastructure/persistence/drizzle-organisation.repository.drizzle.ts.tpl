import { eq } from 'drizzle-orm';
import { saveAggregate } from '@ddd-ts-kit/drizzle/postgres';
import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
import type { Organisation } from '{{alias.context}}/domain/aggregates/organisation.aggregate{{alias.ext}}';
{{#if style.declared}}
import { OrganisationRepository } from '{{alias.context}}/domain/repositories/organisation.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type {
  OrganisationRepository,
} from '{{alias.context}}/domain/repositories/organisation.repository{{alias.ext}}';
{{/unless}}
import type { Database } from '{{alias.platform}}/database/database{{alias.ext}}';
import { organisations } from '{{alias.context}}/infrastructure/persistence/{{context.kebab}}.schema{{alias.ext}}';
import { OrganisationMapper } from '{{alias.context}}/infrastructure/persistence/organisation.mapper{{alias.ext}}';

{{#if style.declared}}
@Repository(OrganisationRepository)
{{/if}}
export class DrizzleOrganisationRepository implements OrganisationRepository {
  constructor(
    private readonly database: Database,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Organisation | undefined> {
    const [row] = await executorOf(this.database).select().from(organisations).where(eq(organisations.id, id));

    return row === undefined ? undefined : OrganisationMapper.toDomain(row);
  }

  async save(saved: Organisation): Promise<void> {
    await saveAggregate(this.database, organisations, {
      aggregate: saved,
      row: OrganisationMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}

/** The executor of the unit of work, which every statement of this file goes through. */
function executorOf(database: Database): ReturnType<Database['executor']> {
  return database.executor();
}
