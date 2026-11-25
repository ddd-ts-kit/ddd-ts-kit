import { definePurityRule } from '../purity/define-purity-rule';
import { PURITY_TABLES } from '../purity/reference/purity-tables';

export const purityNoAmbientRandomness = definePurityRule(PURITY_TABLES['purity/no-ambient-randomness']);
