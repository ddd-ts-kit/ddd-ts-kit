import { definePurityRule } from '../purity/define-purity-rule';
import { PURITY_TABLES } from '../purity/reference/purity-tables';

export const purityNoEnvironment = definePurityRule(PURITY_TABLES['purity/no-environment'], {
  why: 'Reading the environment, logging to the console or touching the network from the domain or a handler hides a dependency that no constructor declares. The class then needs the real world, or a mocked module, to be tested. Every such access is a port with an adapter.',
  bad: `if (process.env.FEATURE_X) console.log('issuing', invoice);`,
  good: `constructor(private readonly features: FeatureFlags) {}`,
});
