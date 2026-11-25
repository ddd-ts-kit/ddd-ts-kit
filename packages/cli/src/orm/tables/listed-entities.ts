import { escapeRegExp } from '../../check/text/escape-reg-exp';
import type { Config } from '../../config';
import { entitiesList } from '../../generate/kinds/same-name/entities-list';
import { importedTwiceNotes } from '../../generate/kinds/same-name/imported-twice-notes';
import { readTablesFile } from '../../generate/kinds/same-name/read-tables-file';
import { workspaceSources } from '../../generate/kinds/same-name/workspace-sources';
import { namedBindingsOf } from '../../migration';
import type { Workspace } from '../../workspace';
import { emptyPicture } from './empty-picture';
import { fileOfTable } from './file-of-table';
import type { IndexNames } from './index-names';

/**
 * The entities a TypeORM index lists in `entities`, each by the file it is imported from,
 * resolved, and its name there: the names of the imports are local to the index. The kit writes
 * no name there after a merge: it cannot tell by the code whether two imports of one name are two
 * entities or one, and says each.
 */
export const listedEntities: IndexNames = {
  picture: (ws, config, { index, text }) => ({
    ...emptyPicture(text),
    reachable: entitiesListed(ws, config, { index, text }),
  }),
  lost: (before, after) =>
    [...before.reachable]
      .filter((table) => !after.reachable.has(table))
      .map((table) => ({ name: table.slice(table.lastIndexOf('#') + 1), was: table, from: fileOfTable(table) })),
  lossesSaid: (losses) =>
    losses.map(
      ({ name, from }) => `the entity \`${name}\`, which '${from}' gives \`entities\`, would be listed no more`,
    ),
  withoutItsTable: ', or the index, which still imports it, does not compile',
  toMoveInside: () =>
    'its import inside the `// ddd-ts-kit:imports` region and its entry inside the `// ddd-ts-kit:schemas` region of `entities`, which the rewrite keeps,',
  listedAs({ config, context }, { declared, local }) {
    const index = `${config.platformDir}/database/schema.ts`;

    return local === declared.constant
      ? []
      : [
          `${index} lists the entity \`${declared.constant}\` of ${context.kebab} as \`${local}\`: the index already holds the name \`${declared.constant}\`. The tables file and what reads it keep that name.`,
        ];
  },
  settled: importedTwiceNotes,
  /** An entry of `entities` the template does not write. */
  unreadOutside(_ws, _config, { outside, rewritten }) {
    const written = new Set(entitiesList(rewritten));

    return entitiesList(outside)
      .filter((entry) => !written.has(entry) && !isOfTheKit(outside, entry))
      .map((entry) => `the entry \`${entry}\` of \`entities\``);
  },
};

function entitiesListed(ws: Workspace, config: Config, { index, text }: { index: string; text: string }): Set<string> {
  const sources = workspaceSources(ws, config);

  const listed = new Set(entitiesList(text));

  return new Set(
    namedBindingsOf(text, 'import').flatMap(({ source, names }) => {
      const resolved = sources.resolve(index, source);
      const from = resolved.kind === 'file' ? resolved.path : source;
      const read = resolved.kind === 'file' ? readTablesFile(sources, resolved.path) : undefined;

      // An entity its file, read with certainty, no longer exports is listed in name only: the index does not compile.
      const isThere = (name: string): boolean =>
        read === undefined || read.unread.length > 0 || read.symbols.some((symbol) => symbol.name === name);

      return names.filter(({ local, name }) => listed.has(local) && isThere(name)).map(({ name }) => `${from}#${name}`);
    }),
  );
}

/**
 * Whether an entry the rewritten list lacks is one a template wrote for another stack: a constant
 * the index builds by calling a function of a package of the kit, as the audit trail or the outbox.
 */
function isOfTheKit(outside: string, entry: string): boolean {
  const name = escapeRegExp(entry.replace(/^\.\.\./, ''));
  const [, built = ''] = new RegExp(`\\bconst ${name}\\b[^=\\n]*=\\s*([\\w$]+)\\(`).exec(outside) ?? [];

  return (
    built !== '' &&
    namedBindingsOf(outside, 'import').some(
      ({ source, names }) => source.startsWith('@ddd-ts-kit/') && names.some(({ local }) => local === built),
    )
  );
}
