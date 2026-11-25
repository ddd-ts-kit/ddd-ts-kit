import { declareTablePersonalFields } from './personal-data/declare-table-personal-fields';
import { defineKind } from '../define-kind';

export const personalFieldsKind = defineKind({
  name: 'personal-fields',
  summary:
    'The declaration of the personal columns of a table no aggregate owns (a read model, a table of received messages, a table written by hand), by its SQL name: next to the adapters, joined to the erasure and to the export of the context, or written with them (ports, adapters, fakes, a spec of it.todo, registration) when it is the first. --subject is required: the row of such a table is rarely the person. The table and its columns are read in the schema of the context and never changed; a column it does not hold is refused. After the table is written in the schema of the context; the table of an aggregate is declared by `generate repository <context> <Aggregate> --personal <column>,...`.',
  scope: 'context',
  positionals: ['table'],
  options: {
    personal: { type: 'string', value: '<column>,<column>...' },
    subject: { type: 'string', value: '<column>' },
    erasure: { type: 'string', value: 'pseudonymise|row' },
    retention: { type: 'string', value: '<column>:<n><d|m|y>' },
    'tenant-scoped': { type: 'boolean' },
  },
  shownOptions:
    '--personal <column>,<column>... --subject <column> [--erasure pseudonymise|row] [--retention <column>:<n><d|m|y>] [--tenant-scoped]',
  shared: {
    files: [
      'the copies and the exports of the platform (<platformDir>/privacy/data-subject-copies.ts, data-subject-exports.ts)',
    ],
    when: 'the declaration is the first of its context, which brings its erasure and its export',
  },
  writesInModules: true,
  run: (scope, request) => {
    declareTablePersonalFields(scope, request.args[1] ?? '');
  },
});
