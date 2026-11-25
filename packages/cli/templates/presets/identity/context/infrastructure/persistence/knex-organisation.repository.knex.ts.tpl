import type { Knex } from 'knex';
import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
import { type KnexContext, saveAggregate } from '@ddd-ts-kit/knex';
import type { Organisation } from '{{alias.context}}/domain/aggregates/organisation.aggregate{{alias.ext}}';
{{#if style.declared}}
import { OrganisationRepository } from '{{alias.context}}/domain/repositories/organisation.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { OrganisationRepository } from '{{alias.context}}/domain/repositories/organisation.repository{{alias.ext}}';
{{/unless}}
import { {{context.constant}}_SCHEMA } from '{{alias.context}}/infrastructure/persistence/{{context.kebab}}.schema{{alias.ext}}';
import { OrganisationMapper } from '{{alias.context}}/infrastructure/persistence/organisation.mapper{{alias.ext}}';
import type { OrganisationRow } from '{{alias.context}}/infrastructure/persistence/organisation-row.schema{{alias.ext}}';

const TABLE = { schema: {{context.constant}}_SCHEMA, table: 'organisations' };

{{#if style.declared}}
@Repository(OrganisationRepository)
{{/if}}
export class KnexOrganisationRepository implements OrganisationRepository {
  constructor(
    private readonly database: KnexContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Organisation | undefined> {
    const row = await tableOf(this.database).where({ id }).first();

    return row === undefined ? undefined : OrganisationMapper.toDomain(row);
  }

  async save(saved: Organisation): Promise<void> {
    await saveAggregate(this.database, TABLE, {
      aggregate: saved,
      row: OrganisationMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}

/** A function and not a method: a query builder is thenable, and a method that answers one is read as asynchronous by whatever wraps the adapter (tracing), which then answers a promise. */
function tableOf(database: KnexContext): Knex.QueryBuilder<OrganisationRow, OrganisationRow[]> {
  const table = database.executor()<OrganisationRow, OrganisationRow[]>('organisations');

  return table.withSchema({{context.constant}}_SCHEMA);
}
