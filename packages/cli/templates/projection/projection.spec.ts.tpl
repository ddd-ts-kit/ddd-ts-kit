import { describe, expect, it } from '{{tests.module}}';
import { NOT_IMPLEMENTED } from '@ddd-ts-kit/kernel';
import { {{event.definition}} } from '{{alias.contexts}}/{{publisher.kebab}}/published-language{{alias.index}}';
import { {{name.pascal}}Projection } from '{{alias.context}}/application/projections/{{name.kebab}}.projection{{alias.ext}}';

// TODO(domain): give the payload every field {{publisher.kebab}} declares.
const fact = {{event.definition}}.create({ {{event.payloadKey}}: '{{event.payloadSample}}' }, { id: 'event-1', occurredAt: '2026-01-01T00:00:00.000Z' });

describe('{{name.title}}, kept from what {{publisher.kebab}} announces', () => {
  // TODO(domain): a generated projection refuses until the line it keeps is written: once it is, replace this test by the entries below, the projection handed the fake of its read model, the line it keeps asserted, `expect(await readModel.get('<id>')).toEqual({ ... })`, and that it answers `'applied'`.
  it('refuses {{event.type}} until the line it writes is decided', async () => {
    const projection = new {{name.pascal}}Projection();

    await expect(projection.{{event.method}}(fact)).rejects.toMatchObject({ code: NOT_IMPLEMENTED });
  });

  it.todo('keeps the line {{event.type}} says');
  it.todo('keeps the same line when the same event is delivered twice');
  it.todo('keeps the newest line when an older event is delivered late');
});
