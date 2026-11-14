import { describe, expect, it } from 'vitest';
import { read, write } from './helpers';
import { INDEX, store } from './support/index-invariant';
import { mergeTrunk } from './support/trunk-history';
import { twoSides } from './support/two-sides';

const SHIPPING = "'@/contexts/shipping/infrastructure/persistence/shipping.schema'";

describe('merge-trunk on Drizzle, a line of the index a team wrote reads a name it imports', () => {
  it('keeps reading the table it imports: the settle writes lines by name, and rebinds no import', () => {
    const root = twoSides({
      orm: 'drizzle',
      trunk: (project) => void store(project, 'billing', 'Order'),
      branch: (project) => {
        store(project, 'shipping', 'Order');

        write(
          project,
          INDEX,
          `import { orders as shippedOrders } from ${SHIPPING};\n${read(project, INDEX)}export const legacyBranch = [shippedOrders];\n`,
        );
      },
    });

    const merged = mergeTrunk(root);

    expect(merged.code, merged.stdout).toBe(0);
    expect(read(root, INDEX)).toContain(`import { orders as shippedOrders } from ${SHIPPING};`);
    expect(read(root, INDEX)).toContain('export const legacyBranch = [shippedOrders];');
    expect(merged.stdout).not.toMatch(/shippedOrders/);
  });
});
