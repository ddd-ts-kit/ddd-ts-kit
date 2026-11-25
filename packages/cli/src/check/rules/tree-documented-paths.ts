import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../../config';
import { firstFlaw } from '../canonical/first-flaw';
import { flawInContexts } from '../canonical/flaw-in-contexts';
import { isContextRelative } from '../canonical/is-context-relative';
import type { Flaw } from '../model/flaw';
import type { ProjectRule } from '../model/rule';
import type { Violation } from '../model/violation';
import { markdownUnder } from '../project/markdown-under';
import { reporter } from '../support/reporter';

/** Where the plan, the design notes and the reviews of a project live. */
const ARCHITECTURE_DOCS = 'docs/architecture';
/** A path written as code in Markdown, a `:line` after it left out. */
const CITED = /`([^`\s]+?)(?::\d+)?`/g;

export const treeDocumentedPaths: ProjectRule = {
  id: 'tree/documented-paths',
  description:
    'A path of a bounded context cited as code in docs/architecture (a plan, a design note, a review), in full or relative to its context, is a place the canonical tree allows: a document that names a directory the tree refuses describes a design the code no longer has.',
  severity: 'warn',
  doc: {
    why: 'A plan, a design note or a review of docs/architecture is read by the next person or agent before the code. When a rule moved a file (a service of application/services became a port), a document that still names the old place sends its reader to a design the code no longer has, and a worker may build it again. Each path of a context written as code in a Markdown file of docs/architecture is judged as tree/closed judges a file: its directories and the file itself must have a place in the canonical tree. A path written relative to its context (`application/services/credit-limit.service.ts`) names no context: it is reported only when every declared context refuses it, their extra directories considered; a path starting with `test/` is left alone, since the project root has `test/e2e/` too. A path that does not exist yet is not reported: a plan names files to create; nor is a path through a dot-directory of a context, which is no part of the tree. It is a warning.',
    bad: `docs/architecture/design-review.md: "add \`src/contexts/billing/application/services/credit-limit.service.ts\`"`,
    good: `docs/architecture/design-review.md: "add the port \`src/contexts/billing/application/ports/credit-limit-reader.port.ts\`"`,
  },
  scope: 'project',
  judge(project) {
    const report = reporter(project, this.id);

    return markdownUnder(project.root, ARCHITECTURE_DOCS).flatMap((document) =>
      citedFlaws(fs.readFileSync(path.join(project.root, document), 'utf8'), project.config).map(
        ({ line, cited, flaw }): Violation =>
          report(
            { file: document, line },
            `"${cited}" names a place the canonical tree refuses: ${flaw.message}`,
            `Write the place the code has now (\`npx ddd-ts-kit describe <context>\` lists it), or remove the path; ${flaw.fix}`,
          ),
      ),
    );
  },
};

interface CitedFlaw {
  readonly line: number;
  readonly cited: string;
  readonly flaw: Flaw;
}

/** Each path of a context cited in a document, with the first flaw of its directories or of itself. */
function citedFlaws(text: string, config: Config): CitedFlaw[] {
  return text.split('\n').flatMap((content, index) =>
    [...content.matchAll(CITED)].flatMap(([, cited = '']) => {
      const flaw = flawOf(cited, config);

      return flaw === undefined ? [] : [{ line: index + 1, cited, flaw }];
    }),
  );
}

/**
 * A full path is judged in its context; a path relative to a context (`application/services/`)
 * names no context, so it is refused only when every declared context refuses it.
 */
function flawOf(cited: string, config: Config): Flaw | undefined {
  if (cited.startsWith(`${config.contextsDir}/`)) {
    return firstFlaw(cited, config);
  }

  return isContextRelative(cited) ? flawInContexts(cited, Object.keys(config.contexts), config) : undefined;
}
