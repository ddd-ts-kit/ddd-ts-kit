import { describe, expect, it } from '{{tests.module}}';
import { NOT_IMPLEMENTED } from '@ddd-ts-kit/kernel';
import { RecordingCommandBus } from '@ddd-ts-kit/kernel/testing';
{{#if upstream.known}}
import { {{upstream.definition}} } from '{{alias.contexts}}/{{upstream.kebab}}/published-language{{alias.index}}';
{{/if}}
import { {{name.pascal}}IntegrationHandler } from '{{alias.context}}/application/integration/handlers/{{name.kebab}}.integration-handler{{alias.ext}}';

const meta = { id: 'event-1', occurredAt: '2026-01-01T00:00:00.000Z' };

describe('When {{upstream.kebab}} publishes {{upstream.eventName}}', () => {
  it('listens to the type {{upstream.kebab}} publishes, as a system actor named after its consumer name', () => {
    const handler = new {{name.pascal}}IntegrationHandler(new RecordingCommandBus());

    expect({{name.pascal}}IntegrationHandler.eventType).toBe('{{upstream.eventName}}');
    expect(handler.actor).toMatchObject({ id: 'system:{{context.kebab}}.{{name.kebab}}', type: 'system' });
  });

  // TODO(domain): a generated handler refuses until what {{context.kebab}} does is written: once it is, replace this test by the entries below, each named after it, the event given (every field {{upstream.kebab}} declares) and the command built with `handler.actor` asserted, `expect(commands.executed).toEqual([new ...Command(handler.actor, ...)])`.
  it('refuses the event until what {{context.kebab}} does with it is written', async () => {
    {{#if upstream.known}}
    const event = {{upstream.definition}}.create({ {{upstream.payloadKey}}: '{{upstream.payloadSample}}' }, meta);
    {{/if}}
    {{#unless upstream.known}}
    const event = { ...meta, type: '{{upstream.eventName}}', version: {{upstream.version}}, payload: {} };
    {{/unless}}
    const handler = new {{name.pascal}}IntegrationHandler(new RecordingCommandBus());

    await expect(handler.handle(event)).rejects.toMatchObject({ code: NOT_IMPLEMENTED });
  });

  it.todo('executes the command that follows the upstream fact');
  it.todo('executes a command that is safe to repeat when the same event is delivered twice');
});
