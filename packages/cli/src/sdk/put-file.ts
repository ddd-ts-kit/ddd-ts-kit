import type { Workspace } from '../workspace';

/**
 * Writes a file the generator owns whether it exists or not, in the dialect of the package manager
 * of the project: it is reported created or updated.
 */
export function putFile(ws: Workspace, file: string, written: string): void {
  const content = ws.spoken(written);

  if (ws.exists(file)) {
    ws.update(file, content);
  } else {
    ws.create(file, content);
  }
}
