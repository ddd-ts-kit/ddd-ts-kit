import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The files besides the schema that change what Prisma writes: the configuration it reads the
 * schema from, and the manifests of the installed `prisma` and `@prisma/client`, which hold their
 * version.
 */
const OTHER_SOURCES = [
  'prisma.config.ts',
  'node_modules/prisma/package.json',
  'node_modules/@prisma/client/package.json',
];

/**
 * What the client and the schema of the tests are derived from, as one digest: the path of the
 * schema, then the path and the content of each of its `files` and of the other sources (empty for
 * one that is not there). Two runs that compute the same one would write the same files.
 */
export function prismaClientFingerprint(root: string, schema: string, files: readonly string[]): string {
  const hash = createHash('sha256').update(`schema ${schema}\n`);

  for (const file of [...files, ...OTHER_SOURCES]) {
    hash
      .update(`file ${file}\n`)
      .update(contentOf(path.join(root, file)))
      .update('\n');
  }

  return hash.digest('hex');
}

function contentOf(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}
