import { undecided } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
import { {{name.pascal}}Reader } from '{{alias.context}}/application/ports/{{name.kebab}}-reader.port{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { {{name.pascal}}Reader } from '{{alias.context}}/application/ports/{{name.kebab}}-reader.port{{alias.ext}}';
{{/unless}}
import type { {{name.pascal}}Query } from '{{alias.context}}/application/queries/{{name.kebab}}/{{name.kebab}}.query{{alias.ext}}';
import type { {{name.pascal}}Result } from '{{alias.context}}/application/queries/{{name.kebab}}/{{name.kebab}}.result{{alias.ext}}';

{{#if style.declared}}
@Repository({{name.pascal}}Reader)
{{/if}}
export class InMemory{{name.pascal}}Reader implements {{name.pascal}}Reader {
  async read(query: {{name.pascal}}Query): Promise<{{name.pascal}}Result> {
    // TODO(domain): read the projection, filtered by `query`, here while its lines are kept in memory or in a production adapter (SQL view, search index) that implements the same port next to this file. Until then the query is refused.
    throw undecided('what "{{name.words}}" reads');
  }
}
