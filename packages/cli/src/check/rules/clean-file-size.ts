import type { Finding } from '../model/finding';
import type { Rule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { besideTheSources } from '../project/beside-the-sources';
import { isGeneratedContextFile } from '../support/is-generated-context-file';
import { perFile } from '../support/per-file';
import { reporter } from '../support/reporter';
import { toViolations } from '../support/to-violations';

const MAX_FILE_LINES = 350;

const SPLIT_BY_RESPONSIBILITY =
  'Split it by responsibility: move each concept (a class, a function with its helpers, a family of cases) to its own file named after it.';

/**
 * An aggregate cannot hand its methods to another class without exposing its state: what moves
 * out is a decision, computed elsewhere and applied by the aggregate.
 */
const SPLIT_AN_AGGREGATE =
  'Move a decision out of the aggregate: a domain service of domain/services/ that takes the state (or a value of it) and returns the new state and its events, which the aggregate applies in its intention method; a value object for fields that travel together, with their rules; an entity for a part with its own identity. Never a public method that sets the state from outside, and never a shortened comment, test or written rule.';

/** An end-to-end spec splits into parts named after it: a generator cannot write them, the guard lets that name through. */
const SPLIT_AN_E2E_SPEC =
  'Split it by behaviour into parts named after it, beside it: test/e2e/<use-case>-<behaviour>.e2e.spec.ts next to test/e2e/<use-case>.e2e.spec.ts (the guard lets that name be written by hand), each part with its own describe. Move what the parts share (signing a person in, a world) to test/e2e/support/<context>/ instead of copying it.';

export const cleanFileSize: Rule = {
  id: 'clean/file-size',
  description: `A file is at most ${MAX_FILE_LINES} lines, sources and tests alike, under the source root, \`test/\` (end-to-end specs included) and \`scripts/\`: past that it holds more than one responsibility.`,
  severity: 'error',
  doc: {
    why: 'Past a few hundred lines a file holds more than one responsibility: nobody reads it whole, and every change touches something unrelated. The limit is 350 physical lines, for sources and tests alike, and is not configurable. A long test file is split by behaviour, a long source by concept. A long end-to-end spec is split into parts named after it, test/e2e/<use-case>-<behaviour>.e2e.spec.ts beside test/e2e/<use-case>.e2e.spec.ts (the one name of a new end-to-end spec the guard of the plugin lets be written by hand, with test/e2e/journey-<name>.e2e.spec.ts for a journey across use cases), and what its parts share goes to test/e2e/support/<context>/. An aggregate keeps its intention methods and moves a decision out: a domain service that takes the state and returns the new state and its events, which the aggregate applies, or a value object for fields that travel together; never a public method that sets its state from outside. Generated files (a path segment named generated, the <context>.declarations.ts and <context>.dependencies.ts at the root of a context, the <layer>.declarations.ts of its layers) and declaration files are not judged.',
    bad: `// application/commands/issue-invoice/issue-invoice.handler.ts, 600 lines:
// the handler, its validation, its mapping and three helpers`,
    good: `// issue-invoice.handler.ts orchestrates, in 40 lines;
// the rules it applies live in the aggregate and in a domain service, each in its file`,
  },
  scope: 'file',
  standalone: true,
  run(project) {
    return perFile(project, this.id, tooLong);
  },
  acrossProject(project) {
    const report = reporter(project, this.id);

    return besideTheSources(project).flatMap((file) => toViolations(report, file.path, tooLong(file)));
  },
};

function tooLong(file: SourceFile): Finding[] {
  const lines = file.text.split('\n').length - (file.text.endsWith('\n') ? 1 : 0);

  if (lines <= MAX_FILE_LINES || isGenerated(file)) {
    return [];
  }

  return [
    {
      line: MAX_FILE_LINES + 1,
      message: `The file is ${lines} lines long (limit ${MAX_FILE_LINES}).`,
      fix: fixFor(file.path),
    },
  ];
}

function fixFor(path: string): string {
  if (path.endsWith('.aggregate.ts')) {
    return SPLIT_AN_AGGREGATE;
  }

  return path.endsWith('.e2e.spec.ts') ? SPLIT_AN_E2E_SPEC : SPLIT_BY_RESPONSIBILITY;
}

/** A file written by a tool: under a directory named `generated`, or the barrel or dependency file of a context. */
function isGenerated(file: SourceFile): boolean {
  return file.path.split('/').includes('generated') || isGeneratedContextFile(file);
}
