import { CliError } from '../../cli-error';
import { label } from '../label';
import { entriesOf } from '../vocabulary/entries-of';
import { vocabularyText } from '../vocabulary/vocabulary-text';
import { defineKind } from '../define-kind';

export const vocabularyKind = defineKind({
  name: 'vocabulary',
  summary:
    'A closed vocabulary of the domain (a status, a kind, a role of the model): an object `as const` of its values and the union type of the same name, so that code reads `AppointmentStatus.NoShow` and never a string; run again, it adds the values the file does not hold yet.',
  scope: 'context',
  positionals: ['Name'],
  options: { value: { type: 'string', multiple: true } },
  shownOptions: '--value <value> [--value <value>]...',
  writesInModules: true,
  run: (scope, request) => {
    const name = label(scope, request.args[1] ?? '', { what: 'vocabulary', strip: ['vocabulary'] });

    if (request.flags.value.length === 0) {
      throw new CliError(
        `The vocabulary ${name.pascal} is given no value.`,
        `Pass each value with --value: \`ddd-ts-kit generate vocabulary ${scope.context.kebab} ${name.pascal} --value <value> --value <value>\`.`,
      );
    }

    const file = `${scope.dir}/domain/vocabularies/${name.kebab}.vocabulary.ts`;
    const existing = request.ws.read(file);
    const text = vocabularyText(name.pascal, entriesOf(request.flags.value), existing);

    if (existing === undefined) {
      request.ws.create(file, text);

      // Every other kind of the domain is held by its spec; a list of values has none, and nothing reads it yet.
      request.ws.note(
        `${name.pascal} is read by nothing yet: \`npm run deadcode\` reports ${file} as unused until a value object, an aggregate or a schema names it.`,
      );
    } else {
      request.ws.update(file, text);
    }
  },
});
