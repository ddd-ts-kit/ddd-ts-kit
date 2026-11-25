import { existingAggregate } from './existing-aggregate';
import { generateRepository } from './generate-repository';
import { declarePersonalData } from './personal-data/declare-personal-data';
import { STORAGE, STORED } from '../shared-write';
import { defineKind } from '../define-kind';

export const repositoryKind = defineKind({
  name: 'repository',
  summary:
    "A repository port (an abstract class of the domain), its in-memory fake, the adapter of the project's ORM with its mapper, the contract suite both pass, and its registration; on an event-sourced aggregate, the adapter over EventSourcedRepository with the codec of its stored events, no table; with --personal, the declaration of the personal columns of its table, and the erasure and the export of the context that read it, and with --retention how long the rows keep it before the nightly purge erases them. After `generate aggregate <context> <Aggregate>`.",
  scope: 'context',
  positionals: ['Aggregate'],
  options: {
    'tenant-scoped': { type: 'boolean' },
    personal: { type: 'string', value: '<column>,<column>...' },
    subject: { type: 'string', value: '<column>' },
    erasure: { type: 'string', value: 'pseudonymise|row' },
    retention: { type: 'string', value: '<column>:<n><d|m|y>' },
  },
  shownOptions:
    '[--tenant-scoped] [--personal <column>,<column>... [--subject <column>] [--erasure pseudonymise|row] [--retention <column>:<n><d|m|y>]]',
  shared: { files: STORAGE, when: STORED },
  writesInModules: true,
  run: (scope, request) => {
    const aggregate = existingAggregate(scope, request.args[1] ?? '');
    const context = generateRepository(scope, aggregate);

    declarePersonalData(scope, aggregate, context);
  },
});
