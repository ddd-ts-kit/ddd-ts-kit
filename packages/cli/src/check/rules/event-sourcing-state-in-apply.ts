import { eventSourcedClasses } from '../event-sourcing/event-sourced-classes';
import { isApplyMethod } from '../event-sourcing/is-apply-method';
import { stateWrites } from '../event-sourcing/state-writes';
import type { Finding } from '../model/finding';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import type { ClassShape } from '../structure/class-shape';
import type { MethodShape } from '../structure/method-shape';

const RECORD = /(?<![\w$.])this\s*\.\s*record\s*\(/g;

const COMMAND_FIX =
  'Decide in the command, then `this.record(new <Fact>(...))`: the state changes in the apply method `appliers()` names for that event, `apply<Fact>(event)`, the only place that writes it, so a replay rebuilds exactly what the command produced.';

const APPLY_FIX =
  'An apply method only changes the state from the event it is given: recording an event there records it again at every replay. Record the follow-up fact from the command that decided it.';

export const eventSourcingStateInApply: FileRule = {
  id: 'event-sourcing/state-in-apply',
  description:
    'An event-sourced aggregate changes its state only in its apply methods (`apply<Fact>`, and `restore` for a snapshot), and an apply method records no event.',
  severity: 'error',
  doc: {
    why: 'An event-sourced aggregate is rebuilt by replaying its events through its apply methods, so the state a command leaves must be exactly what those methods make of the events it recorded. A command that also writes the state directly produces a state no replay will ever rebuild: the aggregate behaves one way just after the command and another way once loaded. Judged: every class of domain/aggregates/ that extends EventSourcedAggregate; outside the constructor, the static methods and the apply methods (a method named apply followed by an upper-case letter, and restore, which takes the state of a snapshot), an assignment, an increment or a mutating call (push, splice, set, add, delete...) on something of this is reported, and so is this.record(..) inside an apply method, which would record the event again at each replay.',
    bad: `// domain/aggregates/attendance-record.aggregate.ts
noteNoShow(appointmentId: string, now: Date): void {
  this.state = { noShows: this.state.noShows + 1 }; // written twice: here and by the replay
  this.record(new NoShowNoted(this.id, now, appointmentId));
}`,
    good: `// domain/aggregates/attendance-record.aggregate.ts
noteNoShow(appointmentId: string, now: Date): void {
  this.record(new NoShowNoted(this.id, now, appointmentId));
}

private applyNoShowNoted(event: NoShowNoted): void {
  this.state = { noShows: this.state.noShows + 1 };
}`,
  },
  scope: 'file',
  judge(file) {
    return eventSourcedClasses(file).flatMap((shape) => shape.methods.flatMap((method) => judged(file, shape, method)));
  },
};

function judged(file: SourceFile, shape: ClassShape, method: MethodShape): Finding[] {
  if (method.isConstructor || method.isStatic) {
    return [];
  }

  const { code } = file.scan;

  if (isApplyMethod(method.name)) {
    return [...code.slice(method.bodyStart, method.end).matchAll(RECORD)].map((match) => ({
      line: file.scan.lineAt(method.bodyStart + match.index),
      message: `The apply method ${method.name} of ${shape.name} records an event.`,
      fix: APPLY_FIX,
    }));
  }

  return stateWrites(code, method.bodyStart, method.end).map((offset) => ({
    line: file.scan.lineAt(offset),
    message: `${method.name} of the event-sourced aggregate ${shape.name} changes its state outside an apply method.`,
    fix: COMMAND_FIX,
  }));
}
