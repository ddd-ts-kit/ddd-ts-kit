import { aggregateMapper } from '@ddd-ts-kit/kernel';
import { {{aggregate.pascal}} } from '{{alias.context}}/domain/aggregates/{{aggregate.kebab}}.aggregate{{alias.ext}}';
import type { {{aggregate.pascal}}Columns, {{aggregate.pascal}}Row } from '{{alias.context}}/infrastructure/persistence/{{aggregate.kebab}}-row.schema{{alias.ext}}';

export const {{aggregate.pascal}}Mapper = aggregateMapper({
  toDomain(row: {{aggregate.pascal}}Row): {{aggregate.pascal}} {
    // TODO(domain): rebuild each value object of {{aggregate.pascal}}State from its columns.
    return {{aggregate.pascal}}.rehydrate(row.id, {});
  },

  toRow(saved: {{aggregate.pascal}}): {{aggregate.pascal}}Columns {
    // TODO(domain): flatten each value object of {{aggregate.pascal}}State into its columns; nothing of the row type leaves this file.
{{#if personal.any}}
    return {
      id: saved.id,
      ...saved.toState(),
      // What the table keeps of the person, as its personal fields declare it: written here once the aggregate carries it, empty until then.
{{personal.nullColumns}}
    };
{{/if}}
{{#unless personal.any}}
    return { id: saved.id, ...saved.toState() };
{{/unless}}
  },
});
