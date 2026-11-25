import type { ProjectFacts } from '../model/project';
import { isDeclaredStyle } from './is-declared-style';

/** Where a binding is written, for a fix text: the declaration of the class, or the module file of the context. */
export function bindingPlace(project: ProjectFacts, context: string): string {
  return isDeclaredStyle(project)
    ? 'its declaration (@Repository, @Gateway or @Adapter on the class)'
    : `${context}.module.ts`;
}
