import { describe, expect, it } from '{{tests.module}}';
import { NOT_IMPLEMENTED } from '@ddd-ts-kit/kernel';
import { {{event.definition}} } from '{{alias.contexts}}/{{publisher.kebab}}/published-language{{alias.index}}';
import { {{name.pascal}}Projection } from '{{alias.context}}/application/projections/{{name.kebab}}.projection{{alias.ext}}';
{{#if readModel.injected}}
import { Fake{{name.pascal}} } from '{{alias.context}}/test/fakes/{{name.kebab}}.fake{{alias.ext}}';
{{/if}}

// TODO(domain): give the payload every field {{publisher.kebab}} declares.
const fact = {{event.definition}}.create({ {{event.payloadKey}}: '{{event.payloadSample}}' }, { id: 'event-1', occurredAt: '2026-01-01T00:00:00.000Z' });

describe('{{name.title}}, kept from what {{publisher.kebab}} announces', () => {
{{#if readModel.injected}}
  // TODO(domain): a generated projection refuses until the line it keeps is written: once it is, replace this test by the entries below, the line the fake of the read model keeps asserted, `expect(await {{name.camel}}.get('<id>')).toEqual({ ... })`, and that the projection answers `'applied'`.
  it('refuses {{event.type}} until the line it writes is decided', async () => {
    const projection = new {{name.pascal}}Projection(new Fake{{name.pascal}}());

    await expect(projection.{{event.method}}(fact)).rejects.toMatchObject({ code: NOT_IMPLEMENTED });
  });
{{/if}}
{{#unless readModel.injected}}
  // TODO(domain): a generated projection refuses until the line it keeps is written: once it is, replace this test by the entries below, the projection handed the fake of its read model, the line it keeps asserted, `expect(await readModel.get('<id>')).toEqual({ ... })`, and that it answers `'applied'`.
  it('refuses {{event.type}} until the line it writes is decided', async () => {
    const projection = new {{name.pascal}}Projection();

    await expect(projection.{{event.method}}(fact)).rejects.toMatchObject({ code: NOT_IMPLEMENTED });
  });
{{/unless}}

  it.todo('keeps the line {{event.type}} says');
  it.todo('keeps the same line when the same event is delivered twice');
  it.todo('keeps the newest line when an older event is delivered late');
});
