import type { Config } from '../../config';
import type { Scope } from '../../generate/scope';
import type { Name } from '../../naming';
import type { RenderContext } from '../../templating';
import type { Workspace } from '../../workspace';
import type { DeclaredTable } from './declared-table';
import type { IndexNames } from './index-names';

/** A context whose tables are made known to the migration tooling again. */
export interface Relisting {
  readonly ws: Workspace;
  readonly config: Config;
  readonly context: Name;
  /** The template variables of the context. */
  readonly vars: RenderContext;
}

/** Where an ORM declares the tables of a context, so that its migration tooling reads them. */
export interface TablesDeclaration {
  /**
   * The tables file of a context, without its extension, in the persistence of the context.
   * Absent where the tables are declared out of the code of the context (the models of Prisma).
   */
  readonly file?: (context: string) => string;
  /** Declares a table, or a model, where the migration tooling reads it. */
  declare(scope: Scope, context: RenderContext, declared: DeclaredTable): void;
  /** Lists the tables of a context again where the tooling no longer reads them; what it reads already is left as it is. */
  relist(relisting: Relisting): void;
  /** The names the schema index gives the tables; absent where the index gives none that two contexts can share. */
  readonly indexNames?: IndexNames;
}
