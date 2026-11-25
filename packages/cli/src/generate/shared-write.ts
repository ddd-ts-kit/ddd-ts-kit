/** What a kind writes outside the context it is given. */
export interface SharedWrite {
  /** The shared files, each in a few words. */
  readonly files: readonly string[];
  /** The projects or the flags it happens with; without it, on every run. */
  readonly when?: string;
  /** How a worker confined to its context may still run the kind, when there is a way. */
  readonly worker?: string;
  /**
   * Said by a kind whose shared files belong to the trunk (the contracts first): a step of the
   * conductor, before the row of the worker, which the refusal of `--local-only` gives it to run there.
   */
  readonly conductorStep?: true;
}

/** Where the tables of a context join the platform: its schema index, or the datasource of its Prisma schema. */
export const STORAGE = [
  'the schema index of the platform (<platformDir>/database/schema.ts)',
  'the datasource of the Prisma schema (prisma/schema/schema.prisma)',
];

/** Where a role is given a permission: the roles and the role vocabulary of the platform. */
export const GRANTS = [
  'the roles of the platform (<platformDir>/auth/roles/roles.ts)',
  'the role vocabulary of the platform (<platformDir>/auth/authorization/role.ts)',
];

/** When a kind of what the shared kernel holds writes there. */
export const IN_SHARED_KERNEL = 'the first argument is shared-kernel';

/** The glossary of the shared kernel, which `--term` writes in when the kind writes there. */
export const SHARED_GLOSSARY = 'the glossary of the shared kernel (<sharedKernelDir>/CONTEXT.md), with --term';

/** When a use case writes in the roles of the platform. */
export const GRANTED = '--grant <role> names the role that holds the permission (stack.authz rbac)';

/** When a repository writes in the storage of the platform: the first of its context. */
export const STORED =
  'the repository is the first of its context: with drizzle, knex or typeorm the tables file of the context joins the schema index, with prisma the database schema of the context joins the datasource (its models go to prisma/schema/<context>.prisma, the file of the context)';
