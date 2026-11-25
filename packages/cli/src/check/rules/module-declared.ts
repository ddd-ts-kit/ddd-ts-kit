import { CONFIG_FILE, type ModuleConfig } from '../../config';
import { moduleNameFlaw } from '../../model-modules';
import { Glossaries } from '../language/glossaries';
import { unknownWords } from '../language/unknown-words';
import type { Report } from '../model/report';
import type { ProjectRule } from '../model/rule';
import type { Violation } from '../model/violation';
import { MODULES_HEADING, modulesSection } from '../modules/modules-section';
import { lineOfSequence } from '../support/line-of-sequence';
import { reporter } from '../support/reporter';

export const moduleDeclared: ProjectRule = {
  id: 'module/declared',
  description:
    'Every module of the model a context declares in contexts.<name>.modules is named with terms of the ubiquitous language of the context, never with a technical word (common, core, utils...; `shared`, the folder of what belongs to no module, is refused by config/valid), and has its row, with its purpose, in the "## Modules" table of the CONTEXT.md of the context.',
  severity: 'error',
  doc: {
    why: 'A module of the model divides one bounded context, one language, one schema and one consistency, into parts a reader opens separately. Evans: "Choose modules that tell the story of the system and contain a cohesive set of concepts. Give the modules names that become part of the ubiquitous language." A module named after a technical grouping (common, core, utils) tells no story and becomes the place where everything else goes; `shared` is no module either, it is the folder of what belongs to none, and config/valid refuses it as a name. The row of the "## Modules" table of CONTEXT.md says what each holds, so that a person or an agent picks the right one before opening a file. A part that needs its own glossary, its own schema or its own published language is not a module: it is another context.',
    bad: `"scheduling": { "modules": { "common": {}, "calendar-stuff": {} } }
// CONTEXT.md has no "## Modules" section`,
    good: `"scheduling": { "modules": { "calendars": { "classification": "supporting" }, "waitlist": {} } }
// CONTEXT.md
## Modules
| Module | Purpose |
|---|---|
| \`calendars\` | The calendars, their opening hours, exceptions and time off. |
| \`waitlist\` | The waitlist of a calendar and the offers made to waiters. |`,
  },
  scope: 'project',
  judge(project) {
    const report = reporter(project, this.id);
    const glossaries = new Glossaries(project.root, project.config.contextsDir);

    return Object.entries(project.config.contexts).flatMap(([context, { modules }]) => {
      if (modules.length === 0) {
        return [];
      }

      const doc = glossaries.docOf(context);
      const section = modulesSection(glossaries.textOf(context));

      return modules.flatMap((module): Violation[] => {
        const where = {
          file: CONFIG_FILE,
          line: lineOfSequence(project.configText, moduleEntry(context, module.name)),
        };

        const named = namingFlaw(module, unknownWords(module.name, glossaries.of(context)));
        const row = section.rows.some((candidate) => candidate.name === module.name);

        return [
          ...(named === undefined ? [] : [report(where, named.message(context), named.fix(context))]),
          ...(row ? [] : [missingRow(report, { doc, context, module, line: section.line ?? 1 })]),
        ];
      });
    });
  },
};

interface NamingFlaw {
  message(context: string): string;
  fix(context: string): string;
}

function namingFlaw(module: ModuleConfig, unknown: readonly string[]): NamingFlaw | undefined {
  const flaw = moduleNameFlaw(module.name);
  const technical = flaw?.reason === 'technical' ? flaw.word : undefined;

  // The name of shared/, the folder of what belongs to no module, is refused by config/valid, once.
  if (flaw?.reason === 'shared-folder') {
    return undefined;
  }

  if (technical !== undefined) {
    return {
      message: (context) =>
        `The module "${module.name}" of "${context}" is named "${technical}", a word that says how code is grouped, not what part of the model it holds.`,
      fix: () =>
        'Name the module after the cluster of concepts it holds, with terms of the glossary (the waitlist, the calendars); what several modules share belongs to one of them, or to a module named after that shared concept (Evans, Abstract Core).',
    };
  }

  if (unknown.length === 0) {
    return undefined;
  }

  return {
    message: (context) =>
      `The module "${module.name}" of "${context}" is named with ${unknown.map((word) => `"${word}"`).join(', ')}, which the glossary of "${context}" does not define.`,
    fix: (context) =>
      `A module is part of the model and its name part of the ubiquitous language (Evans, Modules): define the term with \`ddd-ts-kit generate module ${context} ${module.name} --term "<Term>=<meaning>"\`, or rename the module after a term the glossary has.`,
  };
}

interface Missing {
  readonly doc: string;
  readonly context: string;
  readonly module: ModuleConfig;
  readonly line: number;
}

function missingRow(report: Report, { doc, context, module, line }: Missing): Violation {
  return report(
    { file: doc, line },
    `The module "${module.name}" of "${context}" has no row in the "${MODULES_HEADING}" table of its CONTEXT.md.`,
    `Say what it holds, one sentence in the words of the domain: \`ddd-ts-kit generate module ${context} ${module.name} --purpose "<what it holds>"\` writes the row.`,
  );
}

/** The entry of a module of a context in the config file, searched in order: the context, its modules, the module. */
function moduleEntry(context: string, module: string): string[] {
  return ['"contexts"', `"${context}"`, '"modules"', `"${module}"`];
}
