import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
{{#if tenant.scoped}}
import { type KnexContext, saveTenantAggregate, tenantTable } from '@ddd-ts-kit/knex';
{{/if}}
{{#unless tenant.scoped}}
import { type KnexContext, saveAggregate, tableIn } from '@ddd-ts-kit/knex';
{{/unless}}
import type { {{aggregate.pascal}} } from '{{alias.context}}/domain/aggregates/{{aggregate.kebab}}.aggregate{{alias.ext}}';
{{#if style.declared}}
import { {{aggregate.pascal}}Repository } from '{{alias.context}}/domain/repositories/{{aggregate.kebab}}.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { {{aggregate.pascal}}Repository } from '{{alias.context}}/domain/repositories/{{aggregate.kebab}}.repository{{alias.ext}}';
{{/unless}}
import { {{context.constant}}_SCHEMA } from '{{alias.context}}/infrastructure/persistence/{{context.kebab}}.schema{{alias.ext}}';
import { {{aggregate.pascal}}Mapper } from '{{alias.context}}/infrastructure/persistence/{{aggregate.kebab}}.mapper{{alias.ext}}';
import type { {{aggregate.pascal}}Row } from '{{alias.context}}/infrastructure/persistence/{{aggregate.kebab}}-row.schema{{alias.ext}}';

{{#if tenant.scoped}}
/** Tenant data: every statement reaches it through `tenantTable` or `saveTenantAggregate`, confined to the tenant of the work. */
{{/if}}
const TABLE = { schema: {{context.constant}}_SCHEMA, table: '{{aggregate.table}}' };

{{#if style.declared}}
@Repository({{aggregate.pascal}}Repository)
{{/if}}
export class Knex{{aggregate.pascal}}Repository implements {{aggregate.pascal}}Repository {
  constructor(
    private readonly database: KnexContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<{{aggregate.pascal}} | undefined> {
{{#if tenant.scoped}}
    const row = await tenantTable<{{aggregate.pascal}}Row>(this.database, this.scope, TABLE).where({ id }).first();
{{/if}}
{{#unless tenant.scoped}}
    const row = await tableIn<{{aggregate.pascal}}Row>(this.database, TABLE).where({ id }).first();
{{/unless}}

    return row === undefined ? undefined : {{aggregate.pascal}}Mapper.toDomain(row);
  }

  async save(saved: {{aggregate.pascal}}): Promise<void> {
    await {{#if tenant.scoped}}saveTenantAggregate{{/if}}{{#unless tenant.scoped}}saveAggregate{{/unless}}(this.database, TABLE, {
      aggregate: saved,
      row: {{aggregate.pascal}}Mapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}
