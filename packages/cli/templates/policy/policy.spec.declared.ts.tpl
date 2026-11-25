import { describe, expect, it } from '{{tests.module}}';
import { anActor } from '@ddd-ts-kit/auth/testing';
import { declarationOf } from '@ddd-ts-kit/kernel/declarations';
import { {{name.pascal}}Policy } from '{{alias.context}}/application/authorization/{{name.kebab}}.policy{{alias.ext}}';

describe('{{access.question}}', () => {
  it('bears on the permission {{access.permission}}, under a name of its own', () => {
    expect(declarationOf({{name.pascal}}Policy)).toMatchObject({
      role: 'policy',
      name: '{{context.kebab}}.{{name.kebab}}',
      permission: { id: '{{context.kebab}}:{{access.permission}}' },
    });
  });

  // TODO(domain): a generated policy refuses everybody until its rule is written: once it is, replace this test by the entries below, each a case of the rule with an element built by the builders of test/builders.
  it('refuses everybody until its rule is written', () => {
    const policy = new {{name.pascal}}Policy();

    expect(policy.allows(anActor().build())).toBe(false);
  });

  it.todo('allows the actor the rule is written for');
  it.todo('refuses every other actor, whatever their role');
});
