import { layerDomainPurity } from '../../src/rules/layer-domain-purity';
import { at, BILLING, ruleTester } from '../support/rule-tester';

const AGGREGATE = `${BILLING}/domain/aggregates/invoice.aggregate.ts`;
const DIRECTIVE = '// ddd-ts-kit-disable-next-line';
const WHY = '-- hashing is a pure function here';
const IMPORT = "import { createHash } from 'node:crypto';";

/** The directive the CLI checker reads too, on a rule taken as the example of every rule. */
ruleTester.run('layer-domain-purity under a suppression', layerDomainPurity, {
  valid: [
    at(AGGREGATE, `${DIRECTIVE} layer/domain-purity ${WHY}\n${IMPORT}`),
    at(AGGREGATE, `${DIRECTIVE} purity/no-environment, layer/domain-purity ${WHY}\n${IMPORT}`),
    at(AGGREGATE, `${DIRECTIVE} layer/domain-purity ${WHY}\n${DIRECTIVE} purity/no-environment ${WHY}\n${IMPORT}`),
    at(
      AGGREGATE,
      `${DIRECTIVE} purity/no-environment\n${DIRECTIVE} layer/domain-purity ${WHY}\n${DIRECTIVE}\n${IMPORT}`,
    ),
  ],
  invalid: [
    { ...at(AGGREGATE, `${DIRECTIVE} layer/domain-purity\n${IMPORT}`), errors: [{ messageId: 'builtin' }] },
    { ...at(AGGREGATE, `${DIRECTIVE} purity/no-environment ${WHY}\n${IMPORT}`), errors: [{ messageId: 'builtin' }] },
    { ...at(AGGREGATE, `${DIRECTIVE} layer/domain-purity ${WHY}\n\n${IMPORT}`), errors: [{ messageId: 'builtin' }] },
    {
      ...at(AGGREGATE, `${DIRECTIVE} layer/domain-purity ${WHY}\n// an ordinary comment\n${IMPORT}`),
      errors: [{ messageId: 'builtin' }],
    },
    {
      ...at(AGGREGATE, `const first = 1; ${DIRECTIVE} layer/domain-purity ${WHY}\n${IMPORT}`),
      errors: [{ messageId: 'builtin' }],
    },
  ],
});
