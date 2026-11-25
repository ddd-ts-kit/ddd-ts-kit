import { indexExports } from '../../generate/kinds/same-name/index-exports';
import type { IndexReading } from '../../generate/kinds/same-name/index-reading';
import { linesToSettle } from '../../generate/kinds/same-name/lines-to-settle';
import { readModule } from '../../generate/kinds/same-name/read-module';
import { settleSameNames } from '../../generate/kinds/same-name/settle-same-names';
import { workspaceIndex } from '../../generate/kinds/same-name/workspace-index';
import { workspaceSources } from '../../generate/kinds/same-name/workspace-sources';
import { fileOfTable } from './file-of-table';
import type { IndexNames } from './index-names';

/** What a name lost, said once after the last one: the comparison is of names, not of the tables behind them. */
const NAMES_ONLY = ' (a table still exported under another name is not seen: the kit compares names)';

/**
 * The names a Drizzle index exports: each table is a value exported under a name, which
 * drizzle-kit reads as the compiler resolves it. Two contexts that export one name are told apart
 * by a line of the index that names each.
 */
export const exportedNames: IndexNames = {
  picture(ws, config, { index, text }) {
    const reading = workspaceIndex(ws, config);
    const isCertain = reading.unread.length === 0;
    const exported = [...indexExports(reading)];

    // What the index declares itself is the template's: a table is what a file it re-exports or names holds.
    const names = new Map(
      exported.flatMap(([name, { value }]) =>
        value === undefined || value.startsWith(`${index}#`) ? [] : [[name, value]],
      ),
    );

    return {
      text,
      names,
      reachable: new Set(names.values()),
      unread: reading.unreadFiles,
      toTheSettle: new Set(isCertain ? [] : linesToSettle(reading, {}).map(({ constant }) => constant)),
      givers: new Map([...names.keys()].flatMap((name) => giverOf(reading, name))),
    };
  },
  lost: (before, after) =>
    [...before.names]
      .filter(([name]) => !after.names.has(name))
      .map(([name, was]) => ({ name, was, from: before.givers.get(name) ?? fileOfTable(was) })),
  lossesSaid: (losses) =>
    losses.map(
      ({ name, from }, at) =>
        `the name \`${name}\`, which '${from}' gives the index, would be exported by no line after it${at === losses.length - 1 ? NAMES_ONLY : ''}`,
    ),
  withoutItsTable: '',
  toMoveInside: (names) =>
    `${names === 1 ? 'the line that keeps this name' : 'what keeps these names'} inside the \`// ddd-ts-kit:schemas\` region, which the rewrite keeps,`,
  listedAs({ ws, config, context }, { brought, wiring }) {
    const index = `${config.platformDir}/database/schema.ts`;

    return settleSameNames(ws, config, {
      newcomers: [context.kebab],
      brought,
      // The line as the index holds it: written at the path of the module that holds the tables file.
      stars: (wiring.match(/^export \* from .*$/gm) ?? []).map((line) => ws.withImports(index, line)),
    });
  },
  settled: (ws, config) => settleSameNames(ws, config),
  /** An `export` the kit does not answer for, and a module re-exported whole it does not follow. */
  unreadOutside(ws, config, { index, outside }) {
    const sources = workspaceSources(ws, config);
    const own = readModule(outside);

    return [
      ...[...new Set(own.written)].map((line) => `\`${line}\``),
      ...own.whole
        .filter((source) => sources.resolve(index, source).kind !== 'file')
        .map((source) => `\`export * from '${source}'\`, a module the kit does not follow`),
    ];
  },
};

/** The module the index takes a name from: the one a line by name names, else the file re-exported whole that holds it as a value. */
function giverOf(reading: IndexReading, name: string): [string, string][] {
  const given = reading.given.find(({ local }) => local === name);

  const from =
    given === undefined
      ? reading.stars.find(({ symbols }) => symbols.some((symbol) => symbol.name === name && symbol.kind === 'value'))
          ?.file
      : (given.file ?? given.source);

  return from === undefined ? [] : [[name, from]];
}
