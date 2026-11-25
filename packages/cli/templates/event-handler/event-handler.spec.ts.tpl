import { describe, expect, it } from '{{tests.module}}';
import { NOT_IMPLEMENTED } from '@ddd-ts-kit/kernel';
{{#unless handler.afterCommit}}
import { RecordingCommandBus } from '@ddd-ts-kit/kernel/testing';
{{/unless}}
import { {{handler.pascal}}EventHandler } from '{{alias.context}}/application/event-handlers/{{handler.kebab}}.event-handler{{alias.ext}}';
import { {{event.pascal}} } from '{{alias.context}}/domain/events/{{event.kebab}}.event{{alias.ext}}';

const fact = new {{event.pascal}}('{{aggregate.kebab}}-1', new Date('2026-01-01T00:00:00.000Z'));

describe('When {{event.words}}', () => {
{{#unless handler.afterCommit}}
  // TODO(domain): a generated handler refuses until its policy is written: once it is, replace this test by the entries below, each named after the policy, the fact given and the command recorded asserted, `expect(commands.executed).toEqual([new ...Command(...)])`.
  it('refuses the fact until the policy that follows it is written', async () => {
    const handler = new {{handler.pascal}}EventHandler(new RecordingCommandBus());

    await expect(handler.handle(fact)).rejects.toMatchObject({ code: NOT_IMPLEMENTED });
  });

  it.todo('carries out the policy that follows the fact');
{{/unless}}
{{#if handler.afterCommit}}
  // TODO(domain): a generated handler refuses until its effect is written: once it is, replace this test by the entries below, each named after the effect, the handler given the fake of its port and the fact, what the fake kept asserted.
  it('refuses the fact until the effect that follows its commit is written', async () => {
    await expect(new {{handler.pascal}}EventHandler().handle(fact)).rejects.toMatchObject({ code: NOT_IMPLEMENTED });
  });

  it.todo('carries out the effect that follows the commit of the fact');
{{/if}}
  it.todo('does nothing when the policy does not apply');
});
