import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
{{#if tenant.scoped}}
import { type TypeOrmContext, saveTenantAggregate, tenantWhere } from '@ddd-ts-kit/typeorm';
{{/if}}
{{#unless tenant.scoped}}
import { type TypeOrmContext, saveAggregate } from '@ddd-ts-kit/typeorm';
{{/unless}}
import type { {{aggregate.pascal}} } from '{{alias.context}}/domain/aggregates/{{aggregate.kebab}}.aggregate{{alias.ext}}';
{{#if style.declared}}
import { {{aggregate.pascal}}Repository } from '{{alias.context}}/domain/repositories/{{aggregate.kebab}}.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { {{aggregate.pascal}}Repository } from '{{alias.context}}/domain/repositories/{{aggregate.kebab}}.repository{{alias.ext}}';
{{/unless}}
import { {{aggregate.tableCamel}} } from '{{alias.context}}/infrastructure/persistence/{{context.kebab}}.schema{{alias.ext}}';
import { {{aggregate.pascal}}Mapper } from '{{alias.context}}/infrastructure/persistence/{{aggregate.kebab}}.mapper{{alias.ext}}';

{{#if style.declared}}
@Repository({{aggregate.pascal}}Repository)
{{/if}}
export class TypeOrm{{aggregate.pascal}}Repository implements {{aggregate.pascal}}Repository {
  constructor(
    private readonly database: TypeOrmContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<{{aggregate.pascal}} | undefined> {
{{#if tenant.scoped}}
    const row = await this.database.manager().findOneBy({{aggregate.tableCamel}}, { id, ...tenantWhere(this.scope) });
{{/if}}
{{#unless tenant.scoped}}
    const row = await this.database.manager().findOneBy({{aggregate.tableCamel}}, { id });
{{/unless}}

    return row === null ? undefined : {{aggregate.pascal}}Mapper.toDomain(row);
  }

  async save(saved: {{aggregate.pascal}}): Promise<void> {
    await {{#if tenant.scoped}}saveTenantAggregate{{/if}}{{#unless tenant.scoped}}saveAggregate{{/unless}}(this.database, {{aggregate.tableCamel}}, {
      aggregate: saved,
      row: {{aggregate.pascal}}Mapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}
