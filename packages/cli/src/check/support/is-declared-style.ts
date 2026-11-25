import type { ProjectFacts } from '../model/project';

/** True when the classes of the project say what they are with decorators, false when module files bind them. */
export function isDeclaredStyle(project: ProjectFacts): boolean {
  return project.config.stack.style === 'declared';
}
