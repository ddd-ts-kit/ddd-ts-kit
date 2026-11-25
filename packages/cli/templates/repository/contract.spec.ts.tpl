{{#if adapter.needsDatabase}}
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '{{tests.module}}';
{{/if}}
{{#unless adapter.needsDatabase}}
import { afterEach, beforeEach, describe, expect, it } from '{{tests.module}}';
{{/unless}}
{{#if adapter.needsDatabase}}
import {
  FixedClock,
  FixedExecutionScope,
  executionContext,
  type Actor,
  type ExecutionContext,
} from '@ddd-ts-kit/kernel';
{{/if}}
{{#if tenant.scoped}}
import { repositoryContract, tenantIsolationContract } from '@ddd-ts-kit/testing/contracts';
{{/if}}
{{#unless tenant.scoped}}
import { repositoryContract } from '@ddd-ts-kit/testing/contracts';
{{/unless}}
import type { {{aggregate.pascal}} } from '{{alias.context}}/domain/aggregates/{{aggregate.kebab}}.aggregate{{alias.ext}}';
import { {{adapter.pascal}}{{aggregate.pascal}}Repository } from '{{alias.context}}/infrastructure/persistence/{{adapter.kebab}}-{{aggregate.kebab}}.repository{{alias.ext}}';
{{#if adapter.needsDatabase}}
import { openTestDatabase, type TestDatabase } from '{{alias.platform}}/database/open-test-database{{alias.ext}}';
{{/if}}
import { {{aggregate.article}}{{aggregate.pascal}} } from '{{alias.context}}/test/builders/{{aggregate.kebab}}.builder{{alias.ext}}';
import { Fake{{aggregate.pascal}}Repository } from '{{alias.context}}/test/fakes/{{aggregate.kebab}}.repository.fake{{alias.ext}}';

const runner = { describe, it, expect, beforeEach, afterEach };

const expectations = {
  createAggregate: () => {{aggregate.article}}{{aggregate.pascal}}().build(),
  // TODO(domain): add `mutate: (changed: {{aggregate.pascal}}) => changed.<a business method that records a change of state>(...)`, so that the suite proves an update is stored and a stale save is refused; the case stays pending until then.
  idOf: (subject: {{aggregate.pascal}}) => subject.id,
  stateOf: (subject: {{aggregate.pascal}}) => subject.toState(),
};

repositoryContract<{{aggregate.pascal}}>(runner, {
  ...expectations,
  name: 'Fake{{aggregate.pascal}}Repository',
  createRepository: () => new Fake{{aggregate.pascal}}Repository(),
});
{{#if tenant.scoped}}

tenantIsolationContract<{{aggregate.pascal}}>(runner, {
  ...expectations,
  name: 'Fake{{aggregate.pascal}}Repository',
  elevatedReads: true,
  createRepository: (scope) => new Fake{{aggregate.pascal}}Repository(scope),
});
{{/if}}

{{#if adapter.needsDatabase}}
const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
let database: TestDatabase;

beforeAll(async () => {
  database = await openTestDatabase();
});

afterAll(async () => {
  await database.close();
});

repositoryContract<{{aggregate.pascal}}>(runner, {
  ...expectations,
  name: '{{adapter.pascal}}{{aggregate.pascal}}Repository',
  createRepository: async () => {
    await database.reset();

    const scope = new FixedExecutionScope(workOf('acme'));

    return new {{adapter.pascal}}{{aggregate.pascal}}Repository(database.persistence.database, scope, clock);
  },
});
{{#if tenant.scoped}}

tenantIsolationContract<{{aggregate.pascal}}>(runner, {
  ...expectations,
  name: '{{adapter.pascal}}{{aggregate.pascal}}Repository',
  elevatedReads: true,
  createRepository: async (scope) => {
    await database.reset();

    return new {{adapter.pascal}}{{aggregate.pascal}}Repository(database.persistence.database, scope, clock);
  },
});
{{/if}}

function workOf(tenantId: string): ExecutionContext {
  const actor: Actor = { id: 'member-of-' + tenantId, type: 'user', tenantId, roles: [], attributes: {} };

  return executionContext({ correlationId: 'contract-spec', actor, origin: 'test' });
}
{{/if}}
{{#unless adapter.needsDatabase}}
repositoryContract<{{aggregate.pascal}}>(runner, {
  ...expectations,
  name: '{{adapter.pascal}}{{aggregate.pascal}}Repository',
  createRepository: () => new {{adapter.pascal}}{{aggregate.pascal}}Repository(),
});
{{/unless}}
