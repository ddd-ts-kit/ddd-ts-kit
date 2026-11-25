import { aliasRoots, specifierSuffix } from '../../alias';
import { CONFIG_FILE } from '../../config';
import type { Finding } from '../model/finding';
import type { Flaw } from '../model/flaw';
import type { Project } from '../model/project';
import type { Rule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { besideTheSources } from '../project/beside-the-sources';
import { perFile } from '../support/per-file';
import { reporter } from '../support/reporter';
import { toViolations } from '../support/to-violations';

/** The extensions a module of the project or the file emitted for it can bear. */
const EXTENSION = /\.(?:[cm]?js|[cm]?ts)$/;
const EMITTED = /\.[cm]?js$/;

export const importsExtension: Rule = {
  id: 'imports/extension',
  description:
    'An import of a file of the project ends as "importExtension" says: with no extension under `none`, with `.js` under `js`. Holds under the source root, `test/` and `scripts/`.',
  severity: 'error',
  doc: {
    why: 'An import of a file of the project has one spelling, and "importExtension" in ddd-ts-kit.config.json says which. Under "none", the default of a new project, it names the file without an extension: the compiler resolves as a bundler does ("moduleResolution": "Bundler"), which still reports a file that does not exist but would also accept ".js", so this rule is what refuses it. Under "js", which is also what a config without the key means, it ends with the ".js" of the file the compiler emits: the compiler resolves as Node does and refuses any other spelling itself (TS2835); this rule says it in the words of the project and ESLint fixes it. Node needs the extension at run time either way: `ddd-ts-kit build-aliases` rewrites each alias of the compiled output into a relative path ending in ".js". Under "none" an alias may name a directory (".../published-language"): the compiler resolves its index.ts and the build completes it with "/index.js". Only a specifier that starts with an alias of the project is judged: a package subpath that ends like a file name ("zod/v4/core.js") is left alone, and a relative import belongs to imports/alias-only. A dot in a file name is not an extension: "invoice.aggregate" is written without one. To move a project from one spelling to the other: change "importExtension", write the "module" and "moduleResolution" that imports/alias-declared then asks for, run `eslint --fix` and the formatter.',
    bad: `// ddd-ts-kit.config.json
"importExtension": "none"
// src/contexts/billing/application/commands/issue-invoice/issue-invoice.handler.ts
import { Invoice } from '@/contexts/billing/domain/aggregates/invoice.aggregate.js';
import { InvoiceIssued } from '@/contexts/billing/published-language';`,
    good: `// ddd-ts-kit.config.json
"importExtension": "none"
// src/contexts/billing/application/commands/issue-invoice/issue-invoice.handler.ts
import { Invoice } from '@/contexts/billing/domain/aggregates/invoice.aggregate';
import { InvoiceIssued } from '@/contexts/billing/published-language';`,
  },
  scope: 'file',
  run(project) {
    return perFile(project, this.id, (file) => findingsIn(project, file));
  },
  acrossProject(project) {
    const report = reporter(project, this.id);

    return besideTheSources(project).flatMap((file) => toViolations(report, file.path, findingsIn(project, file)));
  },
};

function findingsIn(project: Project, file: SourceFile): Finding[] {
  const roots = aliasRoots(project.config);
  const judge = specifierSuffix(project.config.importExtension) === '' ? withoutExtension : withExtension;

  return file.imports.flatMap(({ specifier, line }) => {
    const root = roots.find(({ prefix }) => specifier.startsWith(prefix));
    const flaw = root === undefined ? undefined : judge(specifier);

    return flaw === undefined ? [] : [{ line, ...flaw }];
  });
}

function withoutExtension(specifier: string): Flaw | undefined {
  const extension = EXTENSION.exec(specifier)?.[0];

  if (extension !== undefined) {
    return {
      message: `"${specifier}" ends with "${extension}" although "importExtension" is "none" in ${CONFIG_FILE}.`,
      fix: `Write '${specifier.slice(0, -extension.length)}' (\`eslint --fix\` rewrites it): the compiler and every tool that reads the sources resolve the file without its extension, and the build writes the ".js" Node needs into the compiled output.`,
    };
  }

  return undefined;
}

function withExtension(specifier: string): Flaw | undefined {
  if (EMITTED.test(specifier)) {
    return undefined;
  }

  const bare = specifier.replace(EXTENSION, '');

  return {
    message: `"${specifier}" does not end with ".js" although "importExtension" is "js" in ${CONFIG_FILE}.`,
    fix: `Write '${bare}.js' (\`eslint --fix\` rewrites it), the name of the file the compiler emits: the compiler resolves as Node does and refuses any other spelling. To drop the extension everywhere instead, set "importExtension" to "none", regenerate tsconfig.json as \`imports/alias-declared\` says and run \`eslint --fix\`.`,
  };
}
