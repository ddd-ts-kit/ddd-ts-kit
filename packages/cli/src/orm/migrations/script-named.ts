import path from 'node:path';

/** The file of a script under another name, in its folder and with its extension. */
export function scriptNamed(file: string, name: string): string {
  return path.posix.join(path.posix.dirname(file), `${name}${path.posix.extname(file)}`);
}
