import { describe, expect, it } from 'vitest';
import { exportsAnAlias } from '../src/generate/kinds/same-name/exports-an-alias';

describe('a constant a tables file exports', () => {
  it('is not read as a value the module builds itself when its call never closes', () => {
    const code = "export const orders = billingSchema.table('orders', {\n  id: text('id'),\n";

    // A tables file a merge left with a table cut short used to reach this; no merge of the kit writes one any more.
    expect(exportsAnAlias(code, code)).toBe(true);
    expect(exportsAnAlias(`${code}});\n`, `${code}});\n`)).toBe(false);
  });
});
