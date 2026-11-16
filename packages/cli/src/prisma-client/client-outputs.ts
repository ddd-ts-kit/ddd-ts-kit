import fs from 'node:fs';
import path from 'node:path';

/** The `output` of a generator block, as Prisma writes it: a path between double quotes. */
const OUTPUT = /^\s*output\s*=\s*"([^"]+)"/gm;

/** The folders the generators of the schema write, relative to `root`: each `output`, read from the file that states it. */
export function clientOutputs(root: string, files: readonly string[]): readonly string[] {
  return files.flatMap((file) =>
    [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(OUTPUT)].map(([, output = '']) =>
      path.posix.normalize(path.posix.join(path.posix.dirname(file), output)),
    ),
  );
}
