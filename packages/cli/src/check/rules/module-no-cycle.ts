import type { Rule } from '../model/rule';
import { importedModules } from '../modules/imported-modules';
import { type ModuleImport, moduleImports } from '../modules/module-imports';
import { cyclesIn } from '../support/cycles-in';
import { reporter } from '../support/reporter';

const FIX =
  'Look for a way to change the model to disentangle the concepts (Evans, Modules): an effect that follows a decision of one module becomes a domain event the other handles; a concept both reach for may be an overlooked module of its own, which both import; reads of the other module can go through a projection of its events. Coupling between modules is a signal about the model, which is why this is a warning.';

export const moduleNoCycle: Rule = {
  id: 'module/no-cycle',
  description:
    'The production files of the modules of the model of one context import each other in no cycle: when a module imports another, the other does not import it back, directly or through a third. A warning: coupling between modules is a signal to change the model, not a refusal.',
  severity: 'warn',
  doc: {
    why: 'Modules that import each other in a cycle cannot be read, changed or later extracted one without the other. Evans makes the coupling between modules a signal about the model: "This often yields low coupling between modules, but if it doesn\'t look for a way to change the model to disentangle the concepts, or an overlooked concept that might be the basis of a module." So the rule warns instead of refusing, and points at the remedies of the model: a domain event for an effect that follows a decision, a module for the concept both reach for, a projection for reads.',
    bad: `// calendars/domain/aggregates/calendar.aggregate.ts
import { Waitlist } from '@/contexts/scheduling/waitlist/domain/aggregates/waitlist.aggregate.js';
// waitlist/domain/aggregates/waitlist.aggregate.ts
import { Calendar } from '@/contexts/scheduling/calendars/domain/aggregates/calendar.aggregate.js';`,
    good: `// waitlist/application/event-handlers/offer-freed-slot.event-handler.ts
import { SlotFreed } from '@/contexts/scheduling/calendars/domain/events/slot-freed.event.js';
// calendars imports nothing of waitlist: waitlist reacts to what calendars decided`,
  },
  scope: 'project',
  run(project) {
    const report = reporter(project, this.id);

    return [...byContext(moduleImports(project.files))].flatMap(([context, imports]) => {
      const modules = [...new Set(imports.map((one) => one.from))].sort();

      return cyclesIn(modules, importedModules(imports)).map((cycle) => {
        const [first = '', second = ''] = cycle;
        const closing = imports.find((candidate) => candidate.from === first && candidate.to === second);

        return report(
          { file: closing?.file ?? '', line: closing?.line ?? 1 },
          `The modules of the model of "${context}" import each other in a cycle: ${[...cycle, first].join(' -> ')}.`,
          FIX,
        );
      });
    });
  },
};

function byContext(imports: readonly ModuleImport[]): Map<string, ModuleImport[]> {
  const grouped = new Map<string, ModuleImport[]>();

  for (const one of imports) {
    grouped.set(one.context, [...(grouped.get(one.context) ?? []), one]);
  }

  return grouped;
}
