import { optimisticUpdate } from '@ddd-ts-kit/kernel';
import type { Parcel } from './parcel';
import type { UnitOfWorkUnderContract } from './unit-of-work-under-contract';

/**
 * A repository adapter over the table of the subject: it persists under optimistic concurrency,
 * and knows nothing of events. A parcel is a row once: only its first save writes.
 */
export class Parcels {
  constructor(private readonly subject: Pick<UnitOfWorkUnderContract, 'insert'>) {}

  async save(parcel: Parcel): Promise<void> {
    await optimisticUpdate(parcel, async ({ expected }) => {
      if (expected === 0) {
        await this.subject.insert(parcel.id);
      }

      return 1;
    });
  }
}
