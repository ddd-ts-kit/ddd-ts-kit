import { RollbackMap, loadedAt, optimisticUpdate } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
import { {{aggregate.pascal}}, type {{aggregate.pascal}}State } from '{{alias.context}}/domain/aggregates/{{aggregate.kebab}}.aggregate{{alias.ext}}';
{{#if style.declared}}
import { {{aggregate.pascal}}Repository } from '{{alias.context}}/domain/repositories/{{aggregate.kebab}}.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { {{aggregate.pascal}}Repository } from '{{alias.context}}/domain/repositories/{{aggregate.kebab}}.repository{{alias.ext}}';
{{/unless}}

interface Stored{{aggregate.pascal}} {
  readonly state: {{aggregate.pascal}}State;
  readonly version: number;
}

{{#if style.declared}}
@Repository({{aggregate.pascal}}Repository)
{{/if}}
export class InMemory{{aggregate.pascal}}Repository implements {{aggregate.pascal}}Repository {
  // A command that fails takes back what it saved, as the transaction of a database.
  private readonly rows = new RollbackMap<string, Stored{{aggregate.pascal}}>();

  async findById(id: string): Promise<{{aggregate.pascal}} | undefined> {
    const row = this.rows.get(id);

    if (row === undefined) {
      return undefined;
    }

    return loadedAt({{aggregate.pascal}}.rehydrate(id, structuredClone(row.state)), row.version);
  }

  async save(saved: {{aggregate.pascal}}): Promise<void> {
    await optimisticUpdate(saved, async ({ expected, next }) => {
      if ((this.rows.get(saved.id)?.version ?? 0) !== expected) {
        return 0;
      }

      this.rows.set(saved.id, { state: structuredClone(saved.toState()), version: next });

      return 1;
    });
  }
}
