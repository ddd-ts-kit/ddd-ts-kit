import type { Name } from '../../naming';
import { concept } from '../concept';
import { requireFile } from '../require-file';
import type { Scope } from '../scope';

/** The name of an aggregate other kinds build on: it has to exist, its vocabulary was judged when it was created. */
export function existingAggregate(scope: Scope, input: string): Name {
  const aggregate = concept(scope, input, {
    what: 'aggregate',
    strip: ['repository', 'builder'],
    judged: false,
  });

  requireFile(scope, {
    file: `domain/aggregates/${aggregate.kebab}.aggregate.ts`,
    what: `The aggregate ${aggregate.pascal}`,
    createdBy: `ddd-ts-kit generate aggregate ${scope.context.kebab} ${aggregate.pascal}`,
  });

  return aggregate;
}
