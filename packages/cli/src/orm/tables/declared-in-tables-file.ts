import { CliError } from '../../cli-error';
import { applyWiring } from '../../generate/apply-wiring';
import { listedEntity } from '../../generate/kinds/same-name/listed-entity';
import { readTablesFile } from '../../generate/kinds/same-name/read-tables-file';
import { tablesConstants } from '../../generate/kinds/same-name/tables-constants';
import { workspaceSources } from '../../generate/kinds/same-name/workspace-sources';
import type { Scope } from '../../generate/scope';
import { withHeldImports } from '../../init/with-held-imports';
import { isSourceOfContext, listedInIndex } from '../../migration';
import { heldFileOf, treeOf } from '../../model-modules';
import type { Name } from '../../naming';
import { renderTemplate, type RenderContext } from '../../templating';
import { declareOnce } from './declare-once';
import type { DeclaredTable } from './declared-table';
import type { IndexNames } from './index-names';
import type { Relisting, TablesDeclaration } from './tables-declaration';
import { templateOfTable } from './template-of-table';

/** One line of the schema index: what shows it is there, and the constant its wiring names. */
interface IndexEntry {
  readonly listed: Parameters<typeof listedInIndex>[1];
  readonly constant: string;
}

/** The tables file of a context, as the index lists it. */
interface HeldTables {
  readonly context: Name;
  /** The name of the tables file, without its extension. */
  readonly file: string;
  readonly tables: string;
}

/** How one ORM keeps the tables of a context in a file of its persistence, listed in the schema index. */
interface TablesFile {
  /** The folder of its templates, under the kind that declares the table. */
  readonly templates: string;
  /** The name of the tables file of a context, without its extension. */
  readonly file: (context: string) => string;
  /** The files the persistence of a context starts with, the tables file among them, each with the template that writes it. */
  readonly starts: (context: string) => readonly { readonly file: string; readonly template: string }[];
  /** What the index lists of a tables file. */
  readonly entries: (held: HeldTables) => IndexEntry[];
  readonly indexNames?: IndexNames;
}

/** The tables of a context declared in a file of its persistence, which the schema index lists: all the migration tooling reads. */
export function declaredInTablesFile(orm: TablesFile): TablesDeclaration {
  return {
    file: orm.file,
    ...(orm.indexNames === undefined ? {} : { indexNames: orm.indexNames }),
    declare(scope, context, declared) {
      const template = (file: string): string => templateOfTable(declared, `${orm.templates}/${file}`);
      const directory = `${scope.dir}/infrastructure/persistence`;
      const tables = `${directory}/${orm.file(scope.context.kebab)}.ts`;

      for (const start of orm.starts(scope.context.kebab)) {
        scope.ws.create(`${directory}/${start.file}.ts`, renderTemplate(template(start.template), context));
      }

      const held = heldBefore(scope, { tables, constant: declared.constant });

      declareOnce(scope, { file: tables, declared }, renderTemplate(template('table.tpl'), context));

      listInIndex(orm, scope, { context, declared, brought: held ? [] : [declared.constant] });
    },
    relist: (relisting) => relist(orm, relisting),
  };
}

/**
 * Whether the tables file of the context exported the constant before this command: read, never a
 * word of its text. A context that held it is no newcomer to its name. One that exports it from
 * another file, a module it re-exports, is refused: the declaration this command would write
 * would take the name from the table that bears it, which would be in no migration any more.
 */
function heldBefore(
  { ws, config, context }: Scope,
  { tables, constant }: { tables: string; constant: string },
): boolean {
  const { symbols } = readTablesFile(workspaceSources(ws, config), tables);

  const held = symbols.find(({ name, kind }) => kind === 'value' && name === constant);
  const [from = ''] = held?.origin.split('#') ?? [];

  if (held !== undefined && from !== tables) {
    throw new CliError(
      `${tables} already exports \`${constant}\`, from ${from}: a table of that name declared in the tables file of ${context.kebab} would take its place, and the one that bears it would be listed nowhere.`,
      `Give the aggregate or the read model another name, or rename \`${constant}\` in ${from}.`,
    );
  }

  return held !== undefined;
}

/** A table to list in the index, with the names its command brings to its context. */
interface Listing {
  readonly context: RenderContext;
  readonly declared: DeclaredTable;
  readonly brought: readonly string[];
}

/**
 * The tables file joins the schema index, which is all the migration tooling reads. A table of the
 * same name in another context is listed beside it, under a name of the index that carries its
 * context: the index would not compile otherwise, and one of the two tables would never be created.
 */
function listInIndex(orm: TablesFile, scope: Scope, { context, declared, brought }: Listing): void {
  const { config, ws } = scope;
  const index = `${config.platformDir}/database/schema.ts`;

  const listed = listedEntity(ws.read(index) ?? '', {
    context: scope.context,
    constant: declared.constant,
    reserved: tablesConstants(ws, config),
    isOfItsContext: (source) => isSourceOfContext(config, { from: index, source, context: scope.context.kebab }),
  });

  const wiring = renderTemplate(`repository/${orm.templates}/schema-export.tpl`, {
    ...context,
    listed: { ...listed },
  });

  applyWiring(ws, index, wiring);

  const said = orm.indexNames?.listedAs(scope, { declared, brought, local: listed.local, wiring }) ?? [];

  // What the command ends with is compared with what the index gave, once, when every generator has run (`keepThePicture`).
  said.forEach((note) => {
    ws.note(note);
  });
}

/**
 * A context whose tables file the schema index does not name (a project whose earlier `--force`
 * emptied the index, a region the template no longer holds) joins it again. What the index names
 * already is left as it is, however it is written.
 */
function relist(orm: TablesFile, { ws, config, context, vars }: Relisting): void {
  const file = orm.file(context.kebab);
  const index = `${config.platformDir}/database/schema.ts`;
  const tables = ws.read(heldFileOf(ws, treeOf(config, context.kebab), `infrastructure/persistence/${file}.ts`));

  if (tables === undefined || !ws.exists(index)) {
    return;
  }

  const isOfItsContext = (source: string): boolean =>
    isSourceOfContext(config, { from: index, source, context: context.kebab });

  for (const { listed, constant } of orm.entries({ context, file, tables })) {
    const held = ws.read(index) ?? '';

    if (!listedInIndex(held, { ...listed, isOfItsContext })) {
      const reserved = tablesConstants(ws, config);
      const entity = listedEntity(held, { context, constant, reserved, isOfItsContext });

      const wiring = renderTemplate(`repository/${orm.templates}/schema-export.tpl`, {
        ...vars,
        listed: { ...entity },
      });

      applyWiring(ws, index, withHeldImports(ws, config, wiring));
    }
  }
}
