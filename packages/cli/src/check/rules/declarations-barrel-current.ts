import { specifierOf } from '../../alias';
import path from 'node:path';
import {
  barrelFile,
  contextDeclarations,
  contextInjections,
  declaredRoleOf,
  dependenciesFile,
  generatedDrift,
  type DeclaredContext,
  earlierLayoutNotice,
  earlierLayoutOf,
  isDeclarationsFile,
  renderDependenciesFile,
  renderInjections,
} from '../../declared';
import { declaredModules } from '../../model-modules';
import type { Flaw } from '../model/flaw';
import type { Project } from '../model/project';
import type { Rule } from '../model/rule';
import { sourceAt } from '../project/source-at';
import { isDeclaredStyle } from '../support/is-declared-style';
import { reporter } from '../support/reporter';
import { ownEntry } from '../../config/values/own-entry';

const REGENERATE =
  'Run `ddd-ts-kit docs`, or `ddd-ts-kit generate` again, which rewrite it: the file is derived from the role files of the context and from their constructor signatures, and never edited by hand.';

interface Judged {
  readonly file: string;
  readonly flaw: Flaw | undefined;
}

export const declarationsBarrelCurrent: Rule = {
  id: 'declarations/barrel-current',
  description:
    'In the declared style, the generated files of a context are what its tree says: with a barrel, the <layer>.declarations.ts of each layer lists exactly its role files and registers the dependency list read from each constructor, and <context>.declarations.ts re-exports those files; under discovery <context>.dependencies.ts registers the lists alone.',
  severity: 'error',
  doc: {
    why: 'With stack.assembly set to barrel, the composition root assembles a context from <context>.declarations.ts and from nothing else. That file only re-exports the generated <layer>.declarations.ts of each layer of the context that holds a role file (application/application.declarations.ts, infrastructure/infrastructure.declarations.ts, presentation/presentation.declarations.ts), in each module of its model. A role file added by hand and missing from the declarations of its layer compiles, passes its unit tests and is never registered. The same file registers what each constructor of its layer is injected, read from its signature: a constructor changed without regenerating would be given the dependencies of the old one. Each file is derived from the tree, one export per role file sorted by path then one injected(Class, [Tokens]) per class that takes something, so it is compared with what the tree says, and the message names the class whose list is stale; the declarations of a layer that holds no role file any more are reported until they are deleted. A context still declared as an earlier version wrote it, the single <context>.declarations.ts of 0.84 or one <folder>.declarations.ts per role folder as 0.85 and 0.86 wrote them (application/commands/commands.declarations.ts), is reported once, at its summary, and ddd-ts-kit docs moves it to the files of its layers. With stack.assembly set to discovery the role files are found at startup, <context>.dependencies.ts holds the lists alone and is compared the same way, and generated declarations left behind are reported.',
    bad: `// application/application.declarations.ts, while IssueInvoiceHandler now also takes a Clock
export * from '@/contexts/billing/application/commands/issue-invoice/issue-invoice.command';
export * from '@/contexts/billing/application/commands/issue-invoice/issue-invoice.handler';

injected(IssueInvoiceHandler, [InvoiceRepository]);

// application/application.declarations.ts, while application/authorization/only-issuer-voids.policy.ts exists
export * from '@/contexts/billing/application/commands/issue-invoice/issue-invoice.handler';`,
    good: `// application/application.declarations.ts, rewritten by \`ddd-ts-kit generate\`, \`ddd-ts-kit docs\` and \`npm run dev\`
import { injected } from '@ddd-ts-kit/kernel/declarations';
import { Clock } from '@ddd-ts-kit/kernel';
import { IssueInvoiceHandler } from '@/contexts/billing/application/commands/issue-invoice/issue-invoice.handler';
import { InvoiceRepository } from '@/contexts/billing/domain/repositories/invoice.repository';

export * from '@/contexts/billing/application/authorization/only-issuer-voids.policy';
export * from '@/contexts/billing/application/commands/issue-invoice/issue-invoice.command';
export * from '@/contexts/billing/application/commands/issue-invoice/issue-invoice.handler';

injected(IssueInvoiceHandler, [InvoiceRepository, Clock]);

// billing.declarations.ts, the summary the composition root imports
export * from '@/contexts/billing/application/application.declarations';
export * from '@/contexts/billing/infrastructure/infrastructure.declarations';`,
  },
  scope: 'project',
  run(project) {
    if (!isDeclaredStyle(project)) {
      return [];
    }

    const report = reporter(project, this.id);

    return project.contextsOnDisk
      .filter((context) => ownEntry(project.config.contexts, context) !== undefined)
      .flatMap((context) => judge(project, context))
      .flatMap(({ file, flaw }) => (flaw === undefined ? [] : [report({ file, line: 1 }, flaw.message, flaw.fix)]));
  },
};

function judge(project: Project, context: string): Judged[] {
  const directory = `${project.config.contextsDir}/${context}`;
  const entries = entriesOf(project, context);
  const modules = declaredModules(project.config, context);
  const specifierOfFile = (file: string): string => specifierOf(project.config, file);
  const sources = (file: string) => sourceAt(project, file);

  if (project.config.stack.assembly === 'discovery') {
    const injected = renderInjections(contextInjections(sources, { directory, entries, modules }), specifierOfFile);
    const lists = { name: `dependency lists of "${context}"`, expected: renderDependenciesFile(injected, modules) };
    const generated = entries.filter((entry) => isDeclarationsFile(context, entry, modules));

    return [
      ...generated.map((entry) => ({ file: `${directory}/${entry}`, flaw: leftBehind(context, entry) })),
      {
        file: `${directory}/${dependenciesFile(context)}`,
        flaw: stale(project, context, { ...lists, file: dependenciesFile(context), optional: true }),
      },
    ];
  }

  return judgeDeclarations(project, { context, directory, entries, sources, modules, specifierOf: specifierOfFile });
}

/** With a barrel: the declarations of each layer and their summary, or the layout an earlier version wrote, to move. */
function judgeDeclarations(project: Project, declared: DeclaredContext): Judged[] {
  const { context, directory, entries, modules } = declared;
  const { files } = contextDeclarations(declared);

  const judged = [
    ...[...files].map(([entry, expected]) => ({
      file: `${directory}/${entry}`,
      flaw: stale(project, context, { name: nameOf(context, entry), file: entry, expected, optional: false }),
    })),
    ...entries
      .filter((entry) => isDeclarationsFile(context, entry, modules) && !files.has(entry))
      .map((entry) => ({ file: `${directory}/${entry}`, flaw: underived(context, entry) })),
    ...twins(declared),
  ];

  const layout = judged.some(({ flaw }) => flaw !== undefined)
    ? earlierLayoutOf(declared, (entry) => writtenIn(project, `${directory}/${entry}`))
    : undefined;

  // Two role files of one name stay an error in any layout: the summary would not compile.
  return layout === undefined
    ? judged
    : [{ file: `${directory}/${barrelFile(context)}`, flaw: earlierLayoutNotice(context, layout) }, ...twins(declared)];
}

/**
 * Two role files of one name in two folders of a context, as two modules of the model may hold:
 * the summary re-exports both folders with `export *`, and the compiler refuses the name they
 * both export. One name is one concept in a context.
 */
function twins({ context, directory, entries, modules }: DeclaredContext): Judged[] {
  const byName = new Map<string, string[]>();

  for (const entry of entries.filter((candidate) => declaredRoleOf(candidate, modules) !== undefined).sort()) {
    const name = path.posix.basename(entry);

    byName.set(name, [...(byName.get(name) ?? []), entry]);
  }

  return [...byName.values()]
    .filter((files) => files.length > 1)
    .map(([first = '', second = '']) => ({
      file: `${directory}/${second}`,
      flaw: {
        message: `${second} of "${context}" has the name of ${first}: the declarations of the context would export the same name twice.`,
        fix: 'One name is one concept in a context: rename one after the concept it holds, or merge the two into the module that owns the concept.',
      },
    }));
}

interface Generated {
  /** What the file holds, in the message, as the subject of a plural verb. */
  readonly name: string;
  /** The file, relative to the context. */
  readonly file: string;
  readonly expected: string;
  /** True when the file may be absent as long as it would register nothing. */
  readonly optional: boolean;
}

function nameOf(context: string, entry: string): string {
  return entry === barrelFile(context)
    ? `declarations of "${context}"`
    : `declarations of "${context}" in ${entry.slice(0, entry.lastIndexOf('/'))}/`;
}

function stale(project: Project, context: string, { name, file, expected, optional }: Generated): Flaw | undefined {
  const written = writtenIn(project, `${project.config.contextsDir}/${context}/${file}`);

  if (written === expected || (written === undefined && optional && expected === 'export {};\n')) {
    return undefined;
  }

  if (written === undefined) {
    const lacks = file === dependenciesFile(context) ? 'inject its constructors from' : 'assemble these classes from';

    return { message: `The ${name} are missing: the composition root has nothing to ${lacks}.`, fix: REGENERATE };
  }

  return { message: `The ${name} are stale: ${generatedDrift(written, expected)}.`, fix: REGENERATE };
}

function writtenIn(project: Project, file: string): string | undefined {
  return project.files.find((candidate) => candidate.path === file)?.text.replaceAll('\r\n', '\n');
}

function underived(context: string, entry: string): Flaw {
  return {
    message: `${entry} of "${context}" is generated for a folder that holds no declarations any more (a layer without declared role file, or a role folder, which an earlier version declared on its own): nothing keeps it up to date.`,
    fix: 'Run `ddd-ts-kit docs`, or `ddd-ts-kit generate` again, which delete it, and commit the deletion.',
  };
}

function leftBehind(context: string, entry: string): Flaw {
  return {
    message: `${entry} of "${context}" still exists although "stack.assembly" is "discovery": nothing keeps it up to date.`,
    fix: `Delete it and assemble ${context} with discoverContext('${context}', <directory>), or set "stack.assembly" to "barrel" and run \`ddd-ts-kit generate\` again.`,
  };
}

/** The files of a context, relative to it. */
function entriesOf(project: Project, context: string): string[] {
  const prefix = `${project.config.contextsDir}/${context}/`;

  return project.contextEntries
    .filter((entry) => entry.startsWith(prefix) && !entry.endsWith('/'))
    .map((entry) => entry.slice(prefix.length));
}
