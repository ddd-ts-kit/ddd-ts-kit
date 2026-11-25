import { aliasRoots } from '../../alias';
import { buildScripts } from '../alias/build-scripts';
import { compilerPaths } from '../alias/compiler-paths';
import { compilerResolution } from '../alias/compiler-resolution';
import { configuredAlias } from '../alias/configured-alias';
import { graphTools } from '../alias/graph-tools';
import type { Inspected } from '../alias/inspected';
import { neighbourSources } from '../alias/neighbour-sources';
import { sourceRunners } from '../alias/source-runners';
import { testRunners } from '../alias/test-runners';
import type { ProjectRule } from '../model/rule';
import { reporter } from '../support/reporter';

export const importsAliasDeclared: ProjectRule = {
  id: 'imports/alias-declared',
  description:
    'The import alias has one source, "importAlias", and the ending of an import another, "importExtension"; every tool follows them: tsconfig "paths" is exactly what the alias gives, "module" and "moduleResolution" are what the ending needs, with ".js" the type check reads the ".ts" by which the files of `test/support/` name their neighbours and the build emits as before, vitest and dependency-cruiser read tsconfig, jest repeats the same mapping, no knip "paths" adds another, and the build rewrites the aliases after the compiler.',
  severity: 'error',
  doc: {
    why: 'An alias is declared in one place and resolved by many tools: the compiler, the dev runner, the test runner, ESLint, the checker, dependency-cruiser, knip, and the build that makes the output runnable. If two of them disagree, the type check passes on one file while production loads another, or a boundary rule stops seeing an import. So there is one source a person edits, "importAlias" in ddd-ts-kit.config.json, and one declaration derived from it that the tools read, "paths" in tsconfig.json. Node reads neither: the compiler emits an alias as it was written, so `ddd-ts-kit build-aliases` rewrites each one into a relative path after the compiler, and the output runs with plain `node`. The rule compares "paths" (tsconfig.json and tsconfig.build.json) with "importAlias", refuses a second entry under an alias, a "baseUrl" and a knip "paths"; checks that vitest and dependency-cruiser read tsconfig and that jest, which does not, repeats the same mapping; reports a script that compiles without the rewrite step and a tsx script under another tsconfig. The ending of an import has one source too, "importExtension", and three declarations follow it: "module" and "moduleResolution" of tsconfig.json ("ESNext" and "Bundler" without an extension, a Node resolution with one), the pattern of each jest mapping, and the build step, which writes the ".js" Node needs. Under "js" a file directly under test/support/ names its neighbour by the ".ts" of its source (imports/alias-only): where one does, tsconfig.json has to let the type check read that ending, with "allowImportingTsExtensions": true, which the compiler accepts only with "noEmit": true, and tsconfig.build.json, which extends it, has to set both back to false, or the build writes nothing. Whatever the ending, tsconfig.build.json and each tsconfig a script of package.json compiles what ships with are reported when they resolve "noEmit": true, their own or inherited through "extends": the compiler then writes no file, without an error, and an earlier output would ship. An alias is "@/" or "$<name>/": neither can be the name of a package, so no installed dependency can ever take the place of a file of the project; "#<name>/" (a Node subpath import) and "@<name>/" (the name of a scope) are refused.',
    bad: `// ddd-ts-kit.config.json
"importAlias": "@/", "importExtension": "none"
// tsconfig.json
"moduleResolution": "NodeNext",
"paths": { "@/*": ["./dist/src/*"] }
// package.json
"build": "tsc -p tsconfig.build.json"`,
    good: `// ddd-ts-kit.config.json
"importAlias": "@/", "importExtension": "none"
// tsconfig.json
"module": "ESNext", "moduleResolution": "Bundler", "customConditions": ["node"],
"paths": { "@/*": ["./src/*"], "$test/*": ["./test/*"], "$scripts/*": ["./scripts/*"] }
// package.json
"build": "tsc -p tsconfig.build.json && ddd-ts-kit build-aliases"
// vitest.config.ts
resolve: { tsconfigPaths: true }`,
  },
  scope: 'project',
  judge(project) {
    const inspected: Inspected = { project, roots: aliasRoots(project.config), report: reporter(project, this.id) };
    const unsupported = configuredAlias(inspected);

    if (unsupported.length > 0) {
      return unsupported;
    }

    return [
      ...compilerPaths(inspected),
      ...compilerResolution(inspected),
      ...neighbourSources(inspected),
      ...buildScripts(inspected),
      ...sourceRunners(inspected),
      ...testRunners(inspected),
      ...graphTools(inspected),
    ];
  },
};
