import { kernelNames } from '../event-sourcing/kernel-names';
import type { FileRule } from '../model/rule';

/** What reads or writes a stream directly: only infrastructure and the composition root hold them. */
const STORE_NAMES = new Set([
  'EventStore',
  'SnapshotStore',
  'CheckpointStore',
  'EventSourcedRepository',
  'EventSerializer',
  'CatchUpSubscription',
  'InMemoryEventStore',
]);

const FIX =
  'Load and save the aggregate through its repository port (`findById`, `save`): its adapter in infrastructure/persistence/ delegates to `EventSourcedRepository`, and the composition root binds the store. A read that spans streams is a projection fed by the store.';

export const eventSourcingStoreBehindRepository: FileRule = {
  id: 'event-sourcing/store-behind-repository',
  description:
    'domain/ and application/ never name the event store, its snapshots, checkpoints, serializer or subscriptions: an event-sourced aggregate is loaded and saved through its repository port.',
  severity: 'error',
  doc: {
    why: "The domain and the use cases see an event-sourced aggregate exactly as they see any other: loaded by its repository port, changed by its methods, saved by the same port. A handler that reads a stream itself decides how events become state, which is the aggregate's job, and binds the use case to a storage technique the next aggregate may not use. Judged: production files of domain/ and application/ of a context; importing EventStore, SnapshotStore, CheckpointStore, EventSourcedRepository, EventSerializer, CatchUpSubscription or InMemoryEventStore from @ddd-ts-kit/kernel is reported. Infrastructure, the module file and the platform are left alone.",
    bad: `// application/commands/note-no-show/note-no-show.handler.ts
constructor(private readonly store: EventStore) {}
const events = await this.store.readStream(\`scheduling.attendance-record-\${command.patientId}\`);`,
    good: `// application/commands/note-no-show/note-no-show.handler.ts
constructor(private readonly records: AttendanceRecordRepository) {}
const record = await this.records.findById(command.patientId);`,
  },
  scope: 'file',
  judge(file) {
    const { location } = file;

    if (
      location.area !== 'context' ||
      file.isTest ||
      (location.layer !== 'domain' && location.layer !== 'application')
    ) {
      return [];
    }

    return kernelNames(file, STORE_NAMES).map(({ name, line }) => ({
      line,
      message: `${name} is named in ${location.layer}/: ${location.layer === 'domain' ? 'the domain never reads' : 'the use cases never read'} the event store.`,
      fix: FIX,
    }));
  },
};
