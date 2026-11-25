import { isGranted } from '../authz/is-granted';
import { modelledPermissions } from '../authz/modelled-permissions';
import { operatorTuples } from '../authz/operator-tuples';
import { ownAuthorizer } from '../authz/own-authorizer';
import { type PermissionSet, permissionSets } from '../authz/permission-sets';
import { signedInGrants } from '../authz/signed-in-grants';
import type { Finding } from '../model/finding';
import type { Project } from '../model/project';
import type { ProjectRule } from '../model/rule';
import type { Violation } from '../model/violation';
import type { SourceFile } from '../model/source-file';
import { reporter } from '../support/reporter';
import { toViolations } from '../support/to-violations';
import { platformFileIn } from '../../platform-layout';
import { isInProject } from '../authz/is-in-project';

/**
 * Every permission a context declares is granted to someone, where the rights are roles or
 * relationships.
 *
 * Roles: granted by name, to a role or to every signed-in person: by the entry of its set, by its
 * id or by the wildcard of its context. The bare `'*'` of the super-admin does not count: a
 * permission only it reaches is a use case nobody else may run, and nothing says whether that was
 * meant. Silent when the platform holds no roles file.
 *
 * Relationships: a permission the schema leaves on the context is held by the operators of the
 * context, and nobody is an operator until a relationship says so. It is granted when every
 * signed-in person holds it, or when a source outside the tests writes an `operator`
 * relationship on its context, for a person or for a system actor. A permission derived on an element is held through relations the
 * use cases write at run time, which the tree does not show: not judged. Silent when the
 * project decides with an authorizer of its own (`createAuthorizer` imports one from the project),
 * when the checker cannot read the schema, and when an operator tuple names a context it cannot
 * read, and when no source makes a person operator of any context: such a project provisions its
 * operators out of the tree (a seed, an administration tool) and nothing here says otherwise.
 *
 * Silent when the rights are attributes or an authorizer of the project's own.
 */
export const authzGranted: ProjectRule = {
  id: 'authz/granted',
  description:
    'Every permission a context declares is granted: by name to a role or to every signed-in person, not only through the super-admin wildcard (roles), or held by operators some source makes (relationships).',
  severity: 'warn',
  doc: {
    why: "In a project whose rights are roles (stack.authz rbac), a permission does two things: a use case requires it, and a role holds it. The generator declares the first; the grant lives in the roles of the platform. The super-admin holds the wildcard `*`, so a permission no role names is reachable by administrators only, the checks stay green and the people the use case was written for are refused at run time. It fails closed, which is safe, but silently. Judged: every key of every `definePermissions` set of a context is named in `<platformDir>/auth/roles/roles.ts` or in what every signed-in person holds (`signed-in-grants.ts`, which a context preset writes), by the entry of its set (`billingPermissions['invoice.issue']`), by its id (`'billing:invoice.issue'`) or by the wildcard of its context (`'billing:*'`); the bare `*` does not count, and a grant to `Role.System` does. A permission meant for administrators only is granted to `Role.Admin` by name, so that the intent is read in review. Silent when the rights are attributes or an authorizer of the project, and when the platform has no roles file. Under relationships (stack.authz rebac) the same question is asked of the operators: a permission the schema leaves on the context (the schema `init` writes derives on `context` every permission no element derives) is held by the operators of the context, and nobody is an operator until a relationship says so. It is granted when every signed-in person holds it (`signed-in-grants.ts`), or when a source outside the tests writes `{ object: 'context:<context>', relation: 'operator', subject: '<subject>' }` for it, a person (`user:<id>`: a bootstrap, a provisioning step) or a system actor, which holds the permissions of a use case only the system sends (`authz/system-actor-granted` judges that line itself). A permission derived on an element is held through relations the use cases write at run time: not judged. Judged only in a project that provisions operators in its tree, that is when some source makes a person (a subject other than `system:..`) operator of a context: a project that writes none provisions them out of the tree (a seed, an administration tool), and a generated project is silent until the team writes the first. Silent when the checker cannot read the schema (`authz/resource-modelled` says so), finds an operator tuple whose context it cannot read, or the project decides with an authorizer of its own (`createAuthorizer` imports a `*Authorizer` of the project), which may grant what the schema does not. A warning: it fails closed, and a permission granted to nobody can be a state between two slices.",
    bad: `// contexts/billing/application/authorization/billing.permissions.ts
export const billingPermissions = definePermissions('billing', {
  'invoice.void': { description: 'Void invoice' },
});
// platform/auth/roles/roles.ts
export const roles = { [Role.Admin]: ['*'] };`,
    good: `// platform/auth/roles/roles.ts
export const roles = {
  [Role.Admin]: ['*'],
  [Role.Accountant]: [billingPermissions['invoice.void']],
};
// or, when generating the use case: --permission invoice.void --grant accountant`,
  },
  scope: 'project',
  judge(project) {
    if (project.config.stack.authz === 'rebac') {
      return ownAuthorizer(project) ? [] : unheldByOperators(project);
    }

    const { roles, signedIn } = grantFiles(project);

    if (project.config.stack.authz !== 'rbac' || roles === undefined) {
      return [];
    }

    const grants = [roles, ...signedIn];

    const report = reporter(project, this.id);

    return project.files
      .filter((file) => !file.isTest && file.location.area === 'context')
      .flatMap((file) => toViolations(report, file.path, ungranted(file, grants)));
  },
};

/** The roles of the platform, and what every signed-in person holds when a context preset wrote it. */
function grantFiles(project: Project): { roles: SourceFile | undefined; signedIn: SourceFile[] } {
  const path = platformFileIn(project.config, 'auth/roles/roles.ts', (candidate) => isInProject(project, candidate));
  const roles = project.files.find((file) => file.path === path);
  const signedIn = signedInGrants(project);

  return { roles, signedIn: signedIn === undefined ? [] : [signedIn] };
}

function ungranted(file: SourceFile, grants: readonly SourceFile[]): Finding[] {
  return permissionSets(file).flatMap((declared) =>
    declared.keys
      .filter(({ value }) => !grants.some((grant) => isGranted(grant.scan, declared, value)))
      .map(({ value, line }) => ({
        line,
        message: `${declared.context}:${value} is granted to no role: only the super-admin wildcard '*' reaches it.`,
        fix: `Grant ${declared.set}['${value}'] to the roles that hold it in ${grants[0]?.path ?? 'the roles of the platform'} (for example \`[Role.Member]: [${declared.set}['${value}']]\`), or generate the use case with --grant <role>. A permission meant for administrators only is granted to Role.Admin by name.`,
      })),
  );
}

/** Under relationships: a permission left on the context, held by no signed-in person, in a context nobody is made operator of. */
function unheldByOperators(project: Project): Violation[] {
  const schemaFile = schemaOf(project);
  const signedIn = signedInGrants(project);
  const sources = project.files.filter((file) => !file.isTest && file.location.area === 'context');
  const sets = sources.flatMap(permissionSets);

  if (schemaFile === undefined || sets.length === 0) {
    return [];
  }

  const schema = modelledPermissions(schemaFile, sets);
  const operators = operatorTuples(project);

  if (schema.unread.length > 0 || operators.unreadable || !operators.provisioned) {
    return [];
  }

  const report = reporter(project, 'authz/granted');

  const held = (declared: PermissionSet, value: string): boolean =>
    !schema.contextHolds(`${declared.context}:${value}`) ||
    (signedIn !== undefined && isGranted(signedIn.scan, declared, value)) ||
    operators.contexts.has(declared.context);

  return sources.flatMap((file) =>
    toViolations(
      report,
      file.path,
      permissionSets(file).flatMap((declared) =>
        declared.keys
          .filter(({ value }) => !held(declared, value))
          .map(({ value, line }) => heldByNobody(declared, value, line)),
      ),
    ),
  );
}

function schemaOf(project: Project): SourceFile | undefined {
  const path = platformFileIn(project.config, 'auth/relationships/relationship-schema.ts', (candidate) =>
    isInProject(project, candidate),
  );

  return project.files.find((file) => file.path === path);
}

function heldByNobody(declared: PermissionSet, value: string, line: number): Finding {
  return {
    line,
    message: `${declared.context}:${value} is held by the operators of ${declared.context}, and no source makes anybody an operator of it: nobody can run this use case.`,
    fix: `Make somebody operator of the context where the application starts or is provisioned (\`{ object: 'context:${declared.context}', relation: 'operator', subject: 'user:<id>' }\`, written with relationTuples.write), or derive ${declared.set}['${value}'] on the element it is about, or add it to the signed-in grants of the platform when every signed-in person may run it.`,
  };
}
