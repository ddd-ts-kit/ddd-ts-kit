import { specifierOf } from '../alias';
import { isGranted } from '../check/authz/is-granted';
import { scan } from '../check/scan/scan';
import { CliError } from '../cli-error';
import { permissionsFile } from './permissions-file';
import type { Scope } from './scope';
import { declareRole } from './vocabulary/declare-role';
import { withImport } from './with-import';
import { platformPath } from './platform-path';
import { SourceText } from '../source-text';

const SYSTEM = '[Role.System]';

/**
 * Who holds a new permission, in a project whose rights are roles. With `--grant <role>`, the role
 * holds it in the roles of the platform, by the entry of the permission set: the role joins the
 * role vocabulary when it is new. Without it, the next steps say the grant is left to do, since
 * only the super-admin wildcard reaches the permission until then (rule authz/granted).
 */
export function grantPermission(scope: Scope, permission: string): void {
  const role = scope.flags.grant;
  const file = platformPath(scope, 'auth/roles/roles.ts');

  if (scope.config.stack.authz !== 'rbac') {
    refuseGrantOutsideRoles(scope, role);

    return;
  }

  const content = scope.ws.read(file);
  const set = `${scope.context.camel}Permissions`;
  const entry = `${set}['${permission}']`;

  if (content === undefined) {
    if (role !== undefined) {
      throw new CliError(
        `--grant writes in ${file}, which this project does not have.`,
        'Grant the permission where your project keeps its roles, then run the command again without --grant.',
      );
    }

    return;
  }

  if (role === undefined) {
    const holders = [content, scope.ws.read(platformPath(scope, 'auth/authorization/signed-in-grants.ts')) ?? ''];

    if (!holders.some((holder) => isGranted(scan(holder), { set, context: scope.context.kebab }, permission))) {
      scope.ws.step({
        file,
        anchor: 'export const roles',
        text: `grant ${entry} by name to the roles that hold it (or generate with --grant <role>): until then only the super-admin wildcard '*' reaches it (rule authz/granted).`,
      });
    }

    return;
  }

  write(scope, { file, content, entry, set, role, permission });
}

function refuseGrantOutsideRoles(scope: Scope, role: string | undefined): void {
  if (role === undefined) {
    return;
  }

  throw new CliError(
    `--grant writes a grant of the roles of the platform, and the rights of this project are not roles (stack.authz is "${scope.config.stack.authz}").`,
    'Give the right in the model of the project (the attribute policies, a relationship, or the authorizer of the project), and run the command again without --grant.',
  );
}

interface Grant {
  readonly file: string;
  readonly content: string;
  readonly entry: string;
  readonly set: string;
  readonly role: string;
  readonly permission: string;
}

function write(scope: Scope, grant: Grant): void {
  const { file, set, role, permission } = grant;
  const declared = declareRole(scope, role);
  const key = `[Role.${declared.key}]`;
  const granted = withGrant(grant, key);
  const permissions = `${scope.config.contextsDir}/${scope.context.kebab}/${permissionsFile(scope.context)}`;

  const next = [
    `import { ${set} } from '${specifierOf(scope.config, permissions)}';`,
    `import { Role } from '${declared.specifier}';`,
  ].reduce(withImport, granted);

  scope.ws.update(file, next);

  scope.ws.step({
    file,
    anchor: key,
    text: `check this grant: the role ${role} now holds ${scope.context.kebab}:${permission}.`,
  });
}

/**
 * The roles with the entry granted to the role of the key: in the list of that role when it has
 * one, else as a role on a line of its own, before the role of system actors or last. Refused
 * when the roles, or the grants of the role, are not written where the generator reads them: a
 * grant is never written on a guess.
 */
function withGrant({ file, content, entry, role }: Grant, key: string): string {
  const byHand = `Grant ${entry} to the role ${role} by hand, then run the command again without --grant.`;
  const roles = SourceText.of(file, content).objectAssignedTo('roles');

  if (roles === undefined) {
    throw new CliError(`${file} holds no \`export const roles = { ... }\` the generator can read.`, byHand);
  }

  const held = roles.entry(key, role, `'${role}'`, `"${role}"`);

  if (held === undefined) {
    return roles.withEntry(`${key}: [${entry}],`, { before: SYSTEM, byHand });
  }

  const list = held.list();

  if (list === undefined) {
    throw new CliError(
      `${file} gives the role ${role} its grants as \`${held.written}\`, not as a list written there.`,
      byHand,
    );
  }

  return list.with(entry);
}
