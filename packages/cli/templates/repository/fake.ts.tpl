{{#if tenant.scoped}}
import type { ExecutionScope } from '@ddd-ts-kit/kernel';
import { InMemoryRepository, oneTenantScope, snapshots } from '@ddd-ts-kit/testing';
{{/if}}
{{#unless tenant.scoped}}
import { InMemoryRepository, snapshots } from '@ddd-ts-kit/testing';
{{/unless}}
import { {{aggregate.pascal}} } from '{{alias.context}}/domain/aggregates/{{aggregate.kebab}}.aggregate{{alias.ext}}';
import type { {{aggregate.pascal}}Repository } from '{{alias.context}}/domain/repositories/{{aggregate.kebab}}.repository{{alias.ext}}';

export class Fake{{aggregate.pascal}}Repository extends InMemoryRepository<{{aggregate.pascal}}> implements {{aggregate.pascal}}Repository {
{{#if tenant.scoped}}
  constructor(scope: ExecutionScope = oneTenantScope()) {
    super(
      snapshots({
        toSnapshot: (stored: {{aggregate.pascal}}) => ({ id: stored.id, state: stored.toState() }),
        fromSnapshot: ({ id, state }) => {{aggregate.pascal}}.rehydrate(id, state),
      }),
      { confinedTo: scope },
    );
  }
{{/if}}
{{#unless tenant.scoped}}
  constructor() {
    super(
      snapshots({
        toSnapshot: (stored: {{aggregate.pascal}}) => ({ id: stored.id, state: stored.toState() }),
        fromSnapshot: ({ id, state }) => {{aggregate.pascal}}.rehydrate(id, state),
      }),
    );
  }
{{/unless}}

  // TODO(domain): implement each lookup of {{aggregate.pascal}}Repository over `this.all()`, so that handlers are tested against a working repository.
}
