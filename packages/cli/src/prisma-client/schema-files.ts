import fs from 'node:fs';
import path from 'node:path';

/** The files of the Prisma schema at `schema` (a folder, or one file), relative to `root` and sorted; none when it is missing. */
export function schemaFiles(root: string, schema: string): readonly string[] {
  const stat = fs.statSync(path.join(root, schema), { throwIfNoEntry: false });

  if (stat === undefined) {
    return [];
  }

  if (!stat.isDirectory()) {
    return [schema];
  }

  return fs
    .readdirSync(path.join(root, schema), { recursive: true, encoding: 'utf8' })
    .map((entry) => path.posix.join(schema, entry.split(path.sep).join('/')))
    .filter((file) => fs.statSync(path.join(root, file)).isFile())
    .sort();
}
