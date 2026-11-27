import type { Reading, Scope } from '../../scope';
import { cachePolicyText } from './cache-policy-text';
import type { ControllerPlan } from './controller-plan';
import { resolveGroup } from './resolve-group';
import { resourceOf } from './resource-of';
import type { RouteParts } from './route-vars';

/** What a route asks of its controller with `--mapper`, `--serializer` and `--cache`; an upload asks none of them. */
export interface AskedController {
  readonly mapper: boolean;
  readonly serializer: boolean;
  readonly cache: string | undefined;
}

/** Decides where a controller goes and what it stands with, from its route and what is asked of it. */
export function planController(
  scope: Scope<Reading<'group'>>,
  parts: RouteParts,
  asked: AskedController,
): ControllerPlan {
  const { name, endpoint, useCase } = parts;
  const group = resolveGroup(scope, endpoint, useCase);
  const resource = group?.name.kebab ?? resourceOf(scope, endpoint);

  const plan: ControllerPlan = {
    ...parts,
    group,
    folder: `presentation/http/${resource}/${name.kebab}`,
    withMapper: asked.mapper && !useCase.isSearch,
    withSerializer: asked.serializer && useCase.isQuery && !useCase.isSearch,
  };

  const cache = cachePolicyText(asked.cache, plan);

  return cache === undefined ? plan : { ...plan, cache };
}
