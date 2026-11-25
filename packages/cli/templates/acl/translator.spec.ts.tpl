import { describe, expect, it } from '{{tests.module}}';
import { NOT_IMPLEMENTED } from '@ddd-ts-kit/kernel';
import { {{name.pascal}}Translator } from '{{alias.context}}/infrastructure/anti-corruption/{{name.kebab}}.translator{{alias.ext}}';

describe('Translating the model of {{name.title}}', () => {
  // TODO(domain): a generated translator refuses until its mapping is written: once the fields of {{name.title}} are declared, replace this test by the entries below, each a test with a real sample received from {{name.title}}.
  it('refuses a record until its mapping is written', () => {
    const translator = new {{name.pascal}}Translator();

    expect(() => translator.translate({})).toThrow(expect.objectContaining({ code: NOT_IMPLEMENTED }));
  });

  it.todo('maps every field to the vocabulary of {{context.kebab}}');
  it.todo('refuses a record the model of {{context.kebab}} cannot express');
});
