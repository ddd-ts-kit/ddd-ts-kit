import path from 'node:path';
import type { Project } from '../model/project';
import type { ProjectRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { inContext } from '../support/in-context';
import { perFile } from '../support/per-file';
import { testFolderOf } from '../support/test-folder-of';

const AGGREGATE_SUFFIX = '.aggregate.ts';
const BUILDER_SUFFIX = '.builder.ts';

export const testBuilderRequired: ProjectRule = {
  id: 'test/builder-required',
  description: 'An aggregate has a test data builder in test/builders/.',
  severity: 'warn',
  doc: {
    why: 'Tests that build aggregates by hand repeat every mandatory field and break together when one is added. A builder has valid defaults and methods in the ubiquitous language, and goes through the public API of the aggregate, so a test states only what matters to the rule it checks and never starts from an invalid state.',
    bad: `domain/aggregates/invoice.aggregate.ts with no test/builders/invoice.builder.ts`,
    good: `// test/builders/invoice.builder.ts
anInvoice().issued().build();`,
  },
  scope: 'project',
  judge(project) {
    const builders = buildersOf(project);

    return perFile(project, this.id, (file) => {
      const aggregate = aggregateOf(file);

      if (aggregate === undefined || builders.has(`${aggregate.context}/${aggregate.base}`)) {
        return [];
      }

      const directory = `${testFolderOf(project, aggregate.context, aggregate.module).directory}builders/`;
      const fix = `Create ${directory}${aggregate.base}${BUILDER_SUFFIX} with valid defaults and methods named in the ubiquitous language, building through the public API of the aggregate.`;

      return [{ line: 1, message: `The aggregate ${aggregate.name} has no builder in ${directory}.`, fix }];
    });
  },
};

/** `<context>/<aggregate>` for every builder found on disk, in `test/builders/` of the context, of one of its modules or of `shared/`. */
function buildersOf(project: Project): Set<string> {
  const builders = project.contextEntries.flatMap((entry) => {
    const location = project.locate(entry);
    const name = path.posix.basename(entry);

    return inContext(location) &&
      location.layer === 'test' &&
      location.inside[0] === 'builders' &&
      name.endsWith(BUILDER_SUFFIX)
      ? [`${location.context}/${name.slice(0, -BUILDER_SUFFIX.length)}`]
      : [];
  });

  return new Set(builders);
}

interface Aggregate {
  readonly context: string;
  readonly name: string;
  readonly base: string;
  /** The module of the model that holds the aggregate, whose test folder may hold its builder. */
  readonly module: string | undefined;
}

function aggregateOf(file: SourceFile): Aggregate | undefined {
  if (!inContext(file.location) || file.isTest) {
    return undefined;
  }

  const { context, layer, inside, module } = file.location;
  const name = path.posix.basename(file.path);

  if (layer !== 'domain' || inside[0] !== 'aggregates' || !name.endsWith(AGGREGATE_SUFFIX)) {
    return undefined;
  }

  return { context, name, base: name.slice(0, -AGGREGATE_SUFFIX.length), module };
}
