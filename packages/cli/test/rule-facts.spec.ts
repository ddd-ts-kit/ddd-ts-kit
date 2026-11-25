import { describe, expect, it } from 'vitest';
import { CLEAN_RULE_IDS } from '../src/check/catalogue/clean-rule-ids';
import { DEFAULT_SEVERITIES } from '../src/check/catalogue/default-severities';
import { RULES } from '../src/check/catalogue/rules';
import { RULE_DOCS } from '../src/check/explain/rule-docs';

describe('what a rule says of itself', () => {
  it('is what the tables keyed by its id say, wherever the rule says it', () => {
    for (const rule of RULES) {
      if (rule.severity !== undefined) {
        expect(rule.severity, rule.id).toBe(DEFAULT_SEVERITIES[rule.id] ?? 'error');
      }

      if (rule.doc !== undefined) {
        expect(rule.doc, rule.id).toEqual(RULE_DOCS[rule.id]);
      }

      if (rule.standalone !== undefined) {
        expect(CLEAN_RULE_IDS, rule.id).toContain(rule.id);
      }
    }
  });
});
