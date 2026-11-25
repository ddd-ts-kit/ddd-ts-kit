import { definePurityRule } from '../purity/define-purity-rule';
import { PURITY_TABLES } from '../purity/reference/purity-tables';

export const purityNoAmbientRandomness = definePurityRule(PURITY_TABLES['purity/no-ambient-randomness'], {
  why: 'An identifier drawn inside the domain cannot be predicted by a test nor chosen by the caller (idempotent retries, imports of existing data). The IdGenerator port keeps the choice of the scheme in the composition root and gives tests readable, sequential identifiers.',
  bad: `static create(): Invoice { return new Invoice(crypto.randomUUID()); }`,
  good: `static create(id: string): Invoice { return new Invoice(id); }`,
});
