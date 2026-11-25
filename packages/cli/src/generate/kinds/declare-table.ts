import { ORM_MEMBERS } from '../../orm/orm-members';
import type { DeclaredTable } from '../../orm/tables/declared-table';
import type { RenderContext } from '../../templating';
import type { Scope } from '../scope';

/** A table or a model, declared where the migration tooling of the ORM reads it; nothing without an ORM of the kit. */
export function declareTable(scope: Scope, context: RenderContext, declared: DeclaredTable): void {
  ORM_MEMBERS[scope.config.stack.orm].tables?.declare(scope, context, declared);
}
