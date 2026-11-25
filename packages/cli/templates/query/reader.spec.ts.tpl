import { describe, expect, it } from '{{tests.module}}';
{{#if access.protected}}
import { anActor } from '@ddd-ts-kit/auth/testing';
{{/if}}
import { NOT_IMPLEMENTED } from '@ddd-ts-kit/kernel';
import { {{name.pascal}}Query } from '{{alias.context}}/application/queries/{{name.kebab}}/{{name.kebab}}.query{{alias.ext}}';
import { InMemory{{name.pascal}}Reader } from '{{alias.context}}/infrastructure/persistence/{{reader.file}}{{alias.ext}}';

describe('The reader of {{name.words}}', () => {
  // TODO(domain): a generated reader refuses until its read is written: once it is, replace this test by the entries below.
  it('refuses until what "{{name.words}}" reads is written', async () => {
    const query = new {{name.pascal}}Query({{#if access.protected}}anActor().build(){{/if}});

    await expect(new InMemory{{name.pascal}}Reader().read(query)).rejects.toMatchObject({ code: NOT_IMPLEMENTED });
  });

  it.todo('answers what the projection holds for the criteria of the query');
  it.todo('answers only what the asker may see');
});
