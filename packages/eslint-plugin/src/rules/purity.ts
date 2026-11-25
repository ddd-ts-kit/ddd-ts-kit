import { purityRule } from '../support/purity/purity-rule';
import { PURITY_TABLES } from '../support/purity/reference/purity-tables';

export const purityNoSystemClock = purityRule(PURITY_TABLES['purity/no-system-clock']);

export const purityNoAmbientRandomness = purityRule(PURITY_TABLES['purity/no-ambient-randomness']);

export const purityNoEnvironment = purityRule(PURITY_TABLES['purity/no-environment']);
