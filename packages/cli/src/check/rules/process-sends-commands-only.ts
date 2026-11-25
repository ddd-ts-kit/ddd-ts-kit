import type { Finding } from '../model/finding';
import type { Location } from '../model/location';
import type { Rule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { perFile } from '../support/per-file';

const WRITERS: Readonly<Record<string, readonly string[]>> = {
  domain: ['aggregates', 'entities', 'repositories', 'services'],
  application: ['ports'],
};

const FIX =
  'Remove the import and add the command that does the work to the decision of the step: a process never writes an aggregate nor calls an outside system, the handler of each command does, authorized and transactional.';

export const processSendsCommandsOnly: Rule = {
  id: 'process/sends-commands-only',
  description:
    'A process manager of application/processes/*.process.ts changes the world only through the commands it decides: it imports no aggregate, entity, repository, domain service, port or infrastructure, of its context or another.',
  severity: 'error',
  doc: {
    why: 'A process manager coordinates: it reacts to events, keeps its own state and decides what happens next. When it also loads and saves aggregates, of its context or another, or calls an outside system, it becomes a use case nobody can send, with no permission, no audit, and a transaction that spans what it should only coordinate. Its steps answer a decision whose commands do the work, each in its own handler; a file of application/processes/*.process.ts imports no aggregate, entity, repository, domain service, port or infrastructure.',
    bad: `// application/processes/appointment-reminder.process.ts
import { ReminderRepository } from '@/contexts/notification/domain/repositories/reminder.repository';

export class AppointmentReminderProcess {
  constructor(private readonly reminders: ReminderRepository) {}
}`,
    good: `// application/processes/appointment-reminder.process.ts
export class AppointmentReminderProcess implements ProcessManager<ReminderProcessState> {
  booked(event: AppointmentBookedV1, current: ReminderProcessState | undefined) {
    return { state: { appointmentId: event.payload.appointmentId, stage: 'waiting' }, commands: [new PlanReminderCommand(/* ... */)] };
  }
}`,
  },
  scope: 'file',
  run(project) {
    return perFile(project, this.id, (file) => (isProcessFile(file) ? writers(file) : []));
  },
};

function isProcessFile(file: SourceFile): boolean {
  const { location } = file;

  return (
    !file.isTest &&
    location.area === 'context' &&
    location.layer === 'application' &&
    location.inside[0] === 'processes' &&
    file.path.endsWith('.process.ts')
  );
}

function writers(file: SourceFile): Finding[] {
  return file.imports.flatMap(({ target, line }) => {
    const reached = target.kind === 'file' ? writerOf(target.location) : undefined;

    return reached === undefined ? [] : [{ line, message: `The process imports ${reached}.`, fix: FIX }];
  });
}

function writerOf(location: Location): string | undefined {
  if (location.area !== 'context') {
    return undefined;
  }

  if (location.layer === 'infrastructure') {
    return 'infrastructure/';
  }

  const [folder = ''] = location.inside;

  return WRITERS[location.layer]?.includes(folder) === true ? `${location.layer}/${folder}/` : undefined;
}
