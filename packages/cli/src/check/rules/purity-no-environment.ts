import { definePurityRule } from '../purity/define-purity-rule';
import { PURITY_TABLES } from '../purity/reference/purity-tables';

export const purityNoEnvironment = definePurityRule(PURITY_TABLES['purity/no-environment']);
