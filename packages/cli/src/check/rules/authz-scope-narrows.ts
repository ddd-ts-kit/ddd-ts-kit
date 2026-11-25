import { isGranted } from '../authz/is-granted';
import { type PermissionSet, permissionSets } from '../authz/permission-sets';
import { scopedPermission } from '../authz/scoped-permission';
import { type SignedInGrantSources, signedInGrantSources } from '../authz/signed-in-grant-sources';
import type { Finding } from '../model/finding';
import type { Rule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import type { Scan } from '../scan/scan';
import { reporter } from '../support/reporter';
import { toViolations } from '../support/to-violations';
import { callArguments } from '../text/call-arguments';
import { platformFileIn } from '../../platform-layout';
import { isInProject } from '../authz/is-in-project';

/** `<receiver>.scope(`, the opening parenthesis last. */
const SCOPE_CALL = /([\w$.]*)\.scope\s*\(/g;
/** The port `Access` as a handler holds it: `this.access`, `access`. */
const ACCESS = /(?:^|\.)access$/i;

/**
 * A search narrows by the scope of a permission the model decides. Every signed-in person holds
 * the grants of `SignedInGrantsAuthorizer` whatever the model, and it lists them `all` before it
 * asks the model: a handler that asks `Access.scope` about one of them reads every element for
 * every person who signed in. Judged: the second argument of a `.scope(` call in a context, the
 * entry of a permission set written in place or held in a constant or a field of the file, against
 * the grants file of the platform and the grants given to every `new SignedInGrantsAuthorizer`.
 * What it cannot read is said, never taken as safe: grants built by a call, a permission handed in.
 */
export const authzScopeNarrows: Rule = {
  id: 'authz/scope-narrows',
  description:
    'A search narrows by the scope of a permission the model decides, never by one every signed-in person holds: that scope is always all.',
  severity: 'warn',
  doc: {
    why: "Every signed-in person holds the grants of SignedInGrantsAuthorizer, whatever the model of the project: it answers them before it asks the model, for a check and for a listing alike, and the listing is `all`. A handler that narrows a search by the scope of such a permission reads every element for every person who signed in, and the tests of the handler stay green. It is the shortcut taken when the model refuses a search with no element to check (relationships answer RESOURCE_REQUIRED): the grant lets the query past the bus, and the scope no longer narrows anything. The model decides instead: under relationships, the requirement names an enclosing resource (`{ type: 'context', id: '<context>' }` as the generator writes it, or the tenant of the actor) and Access.scope answers the ids of the elements. Judged: the second argument of a `.scope(` call in a context, the entry of a permission set written in place or held in a constant or a field of the same file, against the grants of `<platformDir>/auth/authorization/signed-in-grants.ts` and those given to every `new SignedInGrantsAuthorizer({ grants })` as an array literal or a constant declared as one (an entry, an id, the wildcard of a context, the bare `*`). What it cannot read is reported, never taken as safe: grants built by a call or a spread, a permission handed in to a `.scope(` call on `access`. What it cannot see at all: a permission every person holds through the model itself (a role every account has, a relation every member of a tenant has), and a search that does not ask Access.scope. Those are decisions of the model: the specs of the search prove them, with the real authorizer, an element of another owner absent. A warning: a search every signed-in person may run on every element is legitimate, its scope then says nothing.",
    bad: `// platform/auth/authorization/signed-in-grants.ts
export const signedInGrants: readonly Grant[] = [docsPermissions['document.search']];
// contexts/docs/application/queries/search-documents/search-documents.handler.ts
const scope = await this.access.scope(query.actor, docsPermissions['document.search'], 'document');`,
    good: `// contexts/docs/application/queries/search-documents/search-documents.query.ts
@Requires(docsPermissions['document.search'], { resource: () => ({ type: 'context', id: 'docs' }) })
export class SearchDocumentsQuery extends AuthorizedQuery<SearchDocumentsResult> {}
// contexts/docs/application/queries/search-documents/search-documents.handler.ts
const scope = await this.access.scope(query.actor, docsPermissions['document.search'], 'document');
// { kind: 'ids', ids: [...] }: the documents the actor reaches, an empty page for one who reaches none`,
  },
  scope: 'project',
  run(project) {
    const sources = signedInGrantSources(project);

    if (sources.lists.length === 0 && sources.unread.length === 0) {
      return [];
    }

    const sets = project.files.filter((file) => file.location.area === 'context').flatMap(permissionSets);
    const report = reporter(project, this.id);

    return [
      ...sources.unread.map(({ file, line }) =>
        report(
          { file: file.path, line },
          'The grants of this SignedInGrantsAuthorizer are neither an array literal nor a constant declared as one: the checker cannot tell which searches they widen to all.',
          `Write them in ${platformFileIn(project.config, 'auth/authorization/signed-in-grants.ts', (path) => isInProject(project, path))}, \`export const signedInGrants: readonly Grant[] = [...]\`, and pass \`grants: signedInGrants\`.`,
        ),
      ),
      ...project.files
        .filter((file) => !file.isTest && file.location.area === 'context')
        .flatMap((file) => toViolations(report, file.path, widenedScopes(file, { sources, sets }))),
    ];
  },
};

interface Judged {
  readonly sources: SignedInGrantSources;
  readonly sets: readonly PermissionSet[];
}

function widenedScopes(file: SourceFile, { sources, sets }: Judged): Finding[] {
  const { code } = file.scan;

  return [...code.matchAll(SCOPE_CALL)].flatMap((call): Finding[] => {
    const argument = callArguments(code, call.index + call[0].length - 1)[1];
    const permission = argument === undefined ? undefined : scopedPermission(file, argument, sets);
    const line = file.scan.lineAt(call.index);

    if (permission === undefined) {
      return argument === undefined || !ACCESS.test(call[1] ?? '') ? [] : [unreadPermission(line, argument.code)];
    }

    const { set, key } = permission;

    if (!sources.lists.some((list) => isGranted(list, set, key) || grantsEverything(list))) {
      return [];
    }

    return [
      {
        line,
        message: `${set.context}:${key} is held by every signed-in person: its scope is always all, so every person who signed in reads every element.`,
        fix: `Leave ${set.set}['${key}'] out of what every signed-in person holds (the wildcard '${set.context}:*' holds it too: name the other permissions instead) and let the model decide it: under relationships, the requirement names an enclosing resource (the context, or the tenant) and Access.scope answers the ids of the elements. When every signed-in person may indeed read every element, the scope says nothing: the reader is handed everything.`,
      },
    ];
  });
}

function unreadPermission(line: number, argument: string): Finding {
  return {
    line,
    message: `The permission this search narrows by, \`${argument}\`, is not one the checker can read: it cannot tell whether every signed-in person holds it, in which case the scope would be all.`,
    fix: "Name it in the call as the entry of its set, `billingPermissions['invoice.read']`, or in a constant or a field of this file initialised with one.",
  };
}

/** The bare `*`: every permission of every context. */
function grantsEverything(list: Scan): boolean {
  return list.strings.some(({ value }) => value === '*');
}
