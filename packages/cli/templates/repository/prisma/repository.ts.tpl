import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
{{#if tenant.scoped}}
import { saveTenantAggregate, tenantWhere } from '@ddd-ts-kit/prisma';
{{/if}}
{{#unless tenant.scoped}}
import { saveAggregate } from '@ddd-ts-kit/prisma';
{{/unless}}
import type { {{aggregate.pascal}} } from '{{alias.context}}/domain/aggregates/{{aggregate.kebab}}.aggregate{{alias.ext}}';
{{#if style.declared}}
import { {{aggregate.pascal}}Repository } from '{{alias.context}}/domain/repositories/{{aggregate.kebab}}.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { {{aggregate.pascal}}Repository } from '{{alias.context}}/domain/repositories/{{aggregate.kebab}}.repository{{alias.ext}}';
{{/unless}}
{{storage.adapterImport}}
import { {{aggregate.pascal}}Mapper } from '{{alias.context}}/infrastructure/persistence/{{aggregate.kebab}}.mapper{{alias.ext}}';

{{#if style.declared}}
@Repository({{aggregate.pascal}}Repository)
{{/if}}
export class Prisma{{aggregate.pascal}}Repository implements {{aggregate.pascal}}Repository {
  constructor(
    private readonly database: Database,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<{{aggregate.pascal}} | undefined> {
{{#if tenant.scoped}}
    // findFirst, not findUnique: the tenant is part of every condition, and it is not part of the key.
    const row = await this.database.client().{{context.camel}}{{aggregate.pascal}}.findFirst({
      where: { id, ...tenantWhere(this.scope) },
    });
{{/if}}
{{#unless tenant.scoped}}
    const row = await this.database.client().{{context.camel}}{{aggregate.pascal}}.findUnique({ where: { id } });
{{/unless}}

    return row === null ? undefined : {{aggregate.pascal}}Mapper.toDomain(row);
  }

  async save(saved: {{aggregate.pascal}}): Promise<void> {
    await {{#if tenant.scoped}}saveTenantAggregate{{/if}}{{#unless tenant.scoped}}saveAggregate{{/unless}}(this.database.client().{{context.camel}}{{aggregate.pascal}}, {
      aggregate: saved,
      row: {{aggregate.pascal}}Mapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}
