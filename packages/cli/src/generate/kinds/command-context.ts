import type { Name } from '../../naming';
import { accessVars } from '../access-vars';
import { isDeclared } from '../is-declared';
import { named } from '../named';
import type { Reading, Scope } from '../scope';
import { specVars } from '../spec-vars';
import { vars } from '../vars';
import { worldArrangement } from './world/world-arrangement';
import type { UseCaseContext } from './use-case-context';

/**
 * What the templates of a command read. `asksPolicy`: a policy refines its permission, so the
 * handler receives `Access` and asks it about the aggregate, never about the command. `births`:
 * `--creates` states that the command gives birth to its aggregate; otherwise a command on an aggregate
 * changes one that exists, and its handler refuses until the domain is decided.
 */
export function commandContext(
  scope: Scope<Reading<'grant' | 'permission', 'public'>>,
  { name, aggregate, creates }: { name: Name; aggregate: Name | undefined; creates: boolean },
  asksPolicy: boolean,
): UseCaseContext {
  const births = aggregate !== undefined && creates;
  const reference = `${scope.context.camel}Permissions['${scope.flags.text('permission') ?? ''}']`;
  const required = accessVars(scope, { name, kind: 'Command' });
  const access = { ...required, policy: asksPolicy, policyApplies: asksPolicy && isDeclared(scope.config), reference };
  const spec = { ...specVars(scope, access), ...refusalCodes(required['protected'] === true, births) };

  const world = worldArrangement(scope, spec, {
    repository: aggregate,
    idPrefix: births ? aggregate.kebab : undefined,
    permission: required['protected'] === true ? 'holders' : undefined,
  });

  const context = {
    ...vars(scope, { name: named(name), access, spec, world: world.vars }),
    command: {
      hasAggregate: aggregate !== undefined,
      births,
      changes: aggregate !== undefined && !births,
      result: births ? 'string' : 'void',
    },
    ...(aggregate === undefined ? {} : { aggregate: named(aggregate) }),
  };

  return { vars: context, worldHint: world.hint };
}

/** What the spec reads of the kernel to name its refusals: the permission one, and the one of a handler that refuses until it is written. */
function refusalCodes(isProtected: boolean, births: boolean): { readsKernel: boolean; kernelNames: string } {
  const names = [...(isProtected ? ['KitCodes'] : []), ...(births ? [] : ['NOT_IMPLEMENTED'])];

  return { readsKernel: names.length > 0, kernelNames: names.join(', ') };
}
