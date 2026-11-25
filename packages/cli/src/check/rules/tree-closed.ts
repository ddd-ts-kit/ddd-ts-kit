import type { ProjectRule } from '../model/rule';
import { earlierContextFile } from '../canonical/earlier-context-file';
import { strayEntry } from '../canonical/stray-entry';
import { reporter } from '../support/reporter';

export const treeClosed: ProjectRule = {
  id: 'tree/closed',
  description:
    'A context holds only the canonical directories (plus its declared extraDirectories and the folders of its declared modules), and no source file outside a role directory; its code list and its permission set sit at its root, the root of a module of its model holds only <module>.module.ts, a module holds its tests in <module>/test/, and in a context divided into modules shared/ holds what belongs to none, and nothing else: infrastructure/persistence/, presentation/http/ with its guards/ and shared/, and test/.',
  severity: 'error',
  doc: {
    why: 'A fixed tree means every concept has one obvious place, so people and tools find it without reading the code. Its sources are .ts files: a .js, .mjs, .cjs, .jsx, .tsx, .mts or .cts file in a context is read by no rule and is reported. An ad hoc folder (utils, helpers, common, types, functions) is where unnamed concepts go to hide: a function that reads a value is a method of that value object, a decision over several objects a domain service, a shared shape of data a value object, an interchangeable rule an abstract class of domain/services with one service per variant (docs/ARCHITECTURE.md, a concept with no role of its own). A real new need is declared in extraDirectories with its reason. In the declared style the generated summary <context>.declarations.ts lives at the root of the context, next to CONTEXT.md, and the generated <layer>.declarations.ts of each layer in that layer; a module file may stay at the root when the wiring of a context is unusual. A context divided into modules of its model keeps one more place in the explicit style: <module>/<module>.module.ts, at the root of the folder of each module, registers what the module holds (its handlers, consumers, reactions, jobs and routes) and is composed by <context>.module.ts, which then stays small; nothing else sits at the root of a module. The tree is read as git sees it: what git ignores, and a dot-directory of a context such as the .claude/ a sandbox leaves behind, are not part of it.',
    bad: `contexts/billing/domain/utils/rounding.ts`,
    good: `contexts/billing/domain/value-objects/money.vo.ts
contexts/billing/billing.declarations.ts                          // declared style only
contexts/billing/application/application.declarations.ts          // declared style only
contexts/billing/invoices/invoices.module.ts                      // explicit style, a module of the model
contexts/billing/invoices/test/unit/invoice.aggregate.spec.ts     // a module holds its tests
contexts/billing/shared/infrastructure/persistence/billing.schema.ts // what belongs to no module`,
  },
  scope: 'project',
  judge(project) {
    const report = reporter(project, this.id);
    // A rejected directory is reported once: what it holds is not reported again.
    const rejected: string[] = [];
    const entries = new Set(project.contextEntries);

    return project.contextEntries.flatMap((entry) => {
      if (rejected.some((parent) => entry.startsWith(parent))) {
        return [];
      }

      const earlier = earlierContextFile(entry, project.config, entries);

      if (earlier !== undefined) {
        return [report({ file: entry, line: 1 }, earlier.message, earlier.fix)];
      }

      const flaw = strayEntry(entry, project.config);

      if (flaw === undefined) {
        return [];
      }

      if (entry.endsWith('/')) {
        rejected.push(entry);
      }

      return [report({ file: entry.replace(/\/$/, ''), line: 1 }, flaw.message, flaw.fix)];
    });
  },
};
