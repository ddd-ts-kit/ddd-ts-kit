import { emit } from '../emit';
import { TERM } from '../kind-options';
import { named } from '../named';
import { vars } from '../vars';
import { existingAggregate } from './existing-aggregate';
import { parseTransitions } from './state-machine/parse-transitions';
import { stateMachineVars } from './state-machine/state-machine-vars';
import { statusVocabulary } from './state-machine/status-vocabulary';
import { defineKind } from '../define-kind';

export const stateMachineKind = defineKind({
  name: 'state-machine',
  summary:
    'The lifecycle of an aggregate: its status as the closed vocabulary <Aggregate>Status (created, or extended with the --value it misses, the first one initial), the machine of domain/state-machines/ with the transitions asked, and its spec. CONTEXT.md draws it. After `generate aggregate <context> <Aggregate>`.',
  scope: 'context',
  positionals: ['Aggregate'],
  options: {
    value: { type: 'string', multiple: true, value: '<state>' },
    transition: { type: 'string', multiple: true, value: '"<intention>:<from>[,<from>]...[><to>]"' },
    term: TERM,
  },
  writesInModules: true,
  run: (scope, request) => {
    const aggregate = existingAggregate(scope, request.args[1] ?? '');
    const states = statusVocabulary(scope, aggregate);

    const transitions = parseTransitions(
      request.flags.many('transition'),
      states.map(({ value }) => value),
    );

    const context = vars(scope, {
      aggregate: named(aggregate),
      machine: stateMachineVars({ aggregate, states, transitions }),
    });

    emit(scope, context, [
      ['state-machine/state-machine.ts.tpl', `domain/state-machines/${aggregate.kebab}.state-machine.ts`],
      ['state-machine/state-machine.spec.ts.tpl', `test/unit/${aggregate.kebab}.state-machine.spec.ts`],
    ]);
  },
});
