/** Where knex and TypeORM load their migrations from, and what they load there: a script; a declaration file is not one. */
export const SCRIPTS = {
  folder: 'migrations',
  extensions: ['.js', '.ts', '.mjs', '.cjs'],
  extension: /(?<!\.d)\.(?:js|ts|mjs|cjs)$/,
} as const;
