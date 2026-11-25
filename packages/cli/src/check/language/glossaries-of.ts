import { oncePerProject } from '../support/once-per-project';
import { Glossaries } from './glossaries';

/** The glossaries of a project, each CONTEXT.md read once for every source a rule judges. */
export const glossariesOf = oncePerProject(({ root, config }) => new Glossaries(root, config.contextsDir));
