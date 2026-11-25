{{#if tenant.scoped}}
import { and, eq } from 'drizzle-orm';
import { saveTenantAggregate, tenantCondition } from '@ddd-ts-kit/drizzle/postgres';
{{/if}}
{{#unless tenant.scoped}}
import { eq } from 'drizzle-orm';
import { saveAggregate } from '@ddd-ts-kit/drizzle/postgres';
{{/unless}}
import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
import type { {{aggregate.pascal}} } from '{{alias.context}}/domain/aggregates/{{aggregate.kebab}}.aggregate{{alias.ext}}';
{{#if style.declared}}
import { {{aggregate.pascal}}Repository } from '{{alias.context}}/domain/repositories/{{aggregate.kebab}}.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { {{aggregate.pascal}}Repository } from '{{alias.context}}/domain/repositories/{{aggregate.kebab}}.repository{{alias.ext}}';
{{/unless}}
{{storage.adapterImport}}
import { {{aggregate.tableCamel}} } from '{{alias.context}}/infrastructure/persistence/{{context.kebab}}.schema{{alias.ext}}';
import { {{aggregate.pascal}}Mapper } from '{{alias.context}}/infrastructure/persistence/{{aggregate.kebab}}.mapper{{alias.ext}}';

{{#if style.declared}}
@Repository({{aggregate.pascal}}Repository)
{{/if}}
export class Drizzle{{aggregate.pascal}}Repository implements {{aggregate.pascal}}Repository {
  constructor(
    private readonly database: Database,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<{{aggregate.pascal}} | undefined> {
{{#if tenant.scoped}}
    const mine = and(eq({{aggregate.tableCamel}}.id, id), tenantCondition({{aggregate.tableCamel}}.tenantId, this.scope));
    const [row] = await this.database.executor().select().from({{aggregate.tableCamel}}).where(mine);
{{/if}}
{{#unless tenant.scoped}}
    const byId = eq({{aggregate.tableCamel}}.id, id);
    const [row] = await this.database.executor().select().from({{aggregate.tableCamel}}).where(byId);
{{/unless}}

    return row === undefined ? undefined : {{aggregate.pascal}}Mapper.toDomain(row);
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
