import { optimisticUpdate, unitOfWorkOver, type UnitOfWork } from '../../../src';
import type { Cart } from './cart';

/** The versions of the carts in a store whose transaction really rolls back: what it wrote is undone. */
export class Shelf {
  readonly unitOfWork: UnitOfWork = unitOfWorkOver((work) => this.transaction(work));

  private versions = new Map<string, number>();

  async save(cart: Cart): Promise<void> {
    await optimisticUpdate(cart, async ({ expected, next }) => {
      if ((this.versions.get(cart.id) ?? 0) !== expected) {
        return 0;
      }

      this.versions.set(cart.id, next);

      return 1;
    });
  }

  versionOf(id: string): number | undefined {
    return this.versions.get(id);
  }

  private async transaction<T>(work: () => Promise<T>): Promise<T> {
    const before = new Map(this.versions);

    try {
      return await work();
    } catch (error) {
      this.versions = before;

      throw error;
    }
  }
}
