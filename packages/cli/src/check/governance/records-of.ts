import { oncePerProject } from '../support/once-per-project';
import { DecisionRecords } from './decision-records';

/** The decision records of a project, the same for every source a rule judges. */
export const recordsOf = oncePerProject(({ root }) => new DecisionRecords(root));
