{{#if readModel.injected}}
import { undecided, type ReadModelWrite } from '@ddd-ts-kit/kernel';
{{/if}}
{{#unless readModel.injected}}
import { undecided } from '@ddd-ts-kit/kernel';
{{/unless}}
import { On, Projection } from '@ddd-ts-kit/kernel/declarations';
import { {{event.definition}}, type {{event.typeName}} } from '{{alias.contexts}}/{{publisher.kebab}}/published-language{{alias.index}}';
{{#if readModel.injected}}
import type { {{name.pascal}} } from '{{alias.context}}/application/ports/{{name.kebab}}.port{{alias.ext}}';
{{/if}}

{{#unless readModel.injected}}
{{#if readModel.known}}
// TODO(domain): receive the read model "{{name.words}}" keeps in the constructor, typed by its port ({{name.pascal}} of application/ports/{{name.kebab}}.port{{alias.ext}}); its adapter and its fake are bound to it like any other port.
{{/if}}
{{#unless readModel.known}}
// TODO(domain): receive the port of the read model "{{name.words}}" keeps in the constructor, typed by that port (`ddd-ts-kit generate read-model {{context.kebab}} <Name> --field <name>:<type>` writes it with its table, its store adapter and its fake); its adapter and its fake are bound to it like any other port.
{{/unless}}
{{/unless}}
@Projection('{{context.kebab}}.{{name.kebab}}')
export class {{name.pascal}}Projection {
{{#if readModel.injected}}
  constructor(private readonly {{name.camel}}: {{name.pascal}}) {}

{{/if}}
  @On({{event.definition}})
{{#if readModel.injected}}
  async {{event.method}}(event: {{event.typeName}}): Promise<ReadModelWrite> {
    // TODO(domain): write what {{event.type}} says into the read model and answer what the store answers, `return this.{{name.camel}}.upsertIfNewer(<id>, stampOf(event), () => ({ ... }))` with `stampOf` of the kernel when the event says the whole line (right in any order of delivery), or `this.{{name.camel}}.updateIfNewer(<id>, stampOf(event), (line) => ({ ...line, ... }))` when it changes part of a line another event created, which answers `'missing'` when that line is not there. The stamp keeps a replay or a late delivery from undoing a newer line, and the answer is how the application counts what was applied. Until it is written, the delivery of the event fails.
{{/if}}
{{#unless readModel.injected}}
  async {{event.method}}(event: {{event.typeName}}): Promise<void> {
    // TODO(domain): write what {{event.type}} says into the read model through its port and answer what the store answers, `return this.<port>.upsertIfNewer(<id>, stampOf(event), () => ({ ... }))` with `stampOf` of the kernel when the event says the whole line (right in any order of delivery), or `this.<port>.updateIfNewer(<id>, stampOf(event), (line) => ({ ...line, ... }))` when it changes part of a line another event created, which answers `'missing'` when that line is not there. The stamp keeps a replay or a late delivery from undoing a newer line, and the answer is how the application counts what was applied. Until it is written, the delivery of the event fails.
{{/unless}}
    throw undecided('the line {{event.type}} writes in "{{name.words}}"');
  }
}
