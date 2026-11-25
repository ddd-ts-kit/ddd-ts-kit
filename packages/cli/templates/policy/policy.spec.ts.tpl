import { describe, expect, it } from '{{tests.module}}';
import { anActor } from '@ddd-ts-kit/auth/testing';
import { {{name.camel}} } from '{{alias.context}}/application/authorization/{{name.kebab}}.policy{{alias.ext}}';

const now = new Date('2026-01-01T00:00:00.000Z');

describe('{{access.question}}', () => {
  it('bears on the permission {{access.permission}}', () => {
    expect({{name.camel}}.permission.id).toBe('{{context.kebab}}:{{access.permission}}');
  });

  // TODO(domain): a generated policy refuses everybody until its rule is written: once it is, replace this test by the entries below, each a case of the rule with an element built by the builders of test/builders.
  it('refuses everybody until its rule is written', () => {
    expect({{name.camel}}.allows(anActor().build(), {}, { now })).toBe(false);
  });

  it.todo('allows the actor the rule is written for');
  it.todo('refuses every other actor, whatever their role');
});
