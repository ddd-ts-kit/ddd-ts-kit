import type { StoredSnapshot } from '../../application/event-sourcing/stored-snapshot';
import type { SnapshotStore } from '../../application/ports/snapshot-store';
import { RollbackMap } from './rollback-map';

/** Reference implementation, for tests and single-process apps. A unit of work that rolls back undoes its saves. */
export class InMemorySnapshotStore implements SnapshotStore {
  private readonly snapshots = new RollbackMap<string, StoredSnapshot>();

  async find(stream: string): Promise<StoredSnapshot | undefined> {
    const snapshot = this.snapshots.get(stream);

    return snapshot === undefined ? undefined : structuredClone(snapshot);
  }

  async save(snapshot: StoredSnapshot): Promise<void> {
    const held = this.snapshots.get(snapshot.stream);

    if (held === undefined || held.version < snapshot.version) {
      this.snapshots.set(snapshot.stream, structuredClone(snapshot));
    }
  }
}
