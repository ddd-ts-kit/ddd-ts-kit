import { eventSourcedClasses } from '../event-sourcing/event-sourced-classes';
import { factWords } from '../event-sourcing/fact-words';
import type { Finding } from '../model/finding';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { isPastFact } from '../../naming';

const FIX =
  'Name the event after what happened, with a verb in the past tense: `InvoiceIssued`, `NoShowNoted`, `AmountWithdrawn`, `AppointmentMarkedNoShow`. A stored event is a fact that will be replayed for years; a name in the present or the imperative reads as a command.';

export const eventSourcingPastTense: FileRule = {
  id: 'event-sourcing/past-tense',
  description:
    'The events an event-sourced aggregate imports from domain/events/ are named in the past tense: one word of the fact, the name after the aggregate, is a past participle that does not read as a command at its head.',
  severity: 'error',
  doc: {
    why: 'A stored event is a fact that is kept and replayed for as long as the aggregate lives, read by people and by projections that were not written yet. A name in the present or the imperative (BookAppointment, Cancel) reads as a request that may still be refused; a name in the past tense says it happened. Judged: in a file of domain/aggregates/ holding a class that extends EventSourcedAggregate, every name imported from domain/events/. Its fact is judged, the words after the name of the aggregate when it starts with it (InvoiceIssued of Invoice: Issued), the whole name otherwise: one word of it must read as a past participle (ending in -ed, or a common irregular one such as paid, held, taken, withdrawn, sent, set, made, done, lost, won), and a participle spelled like its imperative (set, put, read, run, cut, found, left...) does not count at the head of the fact, where it reads as a command (SetPrice, ReadInvoice). The same words generate domain-event accepts.',
    bad: `// domain/aggregates/attendance-record.aggregate.ts
import { NoteNoShow } from '@/contexts/scheduling/domain/events/note-no-show.event';`,
    good: `// domain/aggregates/attendance-record.aggregate.ts
import { NoShowNoted } from '@/contexts/scheduling/domain/events/no-show-noted.event';`,
  },
  scope: 'file',
  judge(file) {
    const aggregates = eventSourcedClasses(file).map(({ name }) => name);

    return aggregates.length === 0 ? [] : misnamed(file, aggregates);
  },
};

function misnamed(file: SourceFile, aggregates: readonly string[]): Finding[] {
  return file.imports.flatMap(({ target, names, line }) => {
    const fromEvents =
      target.kind === 'file' &&
      target.location.area === 'context' &&
      target.location.layer === 'domain' &&
      target.location.inside[0] === 'events';

    if (!fromEvents) {
      return [];
    }

    return names
      .filter((name) => !isPastFact(factWords(name, aggregates)))
      .map((name) => ({ line, message: `The event ${name} is not named in the past tense.`, fix: FIX }));
  });
}
