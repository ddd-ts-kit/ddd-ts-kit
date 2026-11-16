import fs from 'node:fs';
import path from 'node:path';
import type { Workspace } from '../../../workspace';
import { LINKED, LINKED_AWAY } from './linked';
import type { FileReader } from './sources-of';

/**
 * Reads a file of the project a workspace holds as the kit reads its sources: a file that is a
 * symbolic link on disk reads as `LINKED`, never as the file it points at: the text a link to a
 * file points at in the project follows, only for a word to be found in. One whose text is not
 * looked into, a link out of the project, to another link or to nothing, or a file a folder of its
 * path that is a link leads to, reads as `LINKED_AWAY`. Whether a target is in the project is told by its path as
 * written against the real path of the project, the way git tells it: a target written through
 * another path of the same folder is outside.
 */
export function projectReader(ws: Workspace): FileReader {
  return (file) => {
    const placed = ws.placed(file);

    if (crossesLink(ws.root, placed)) {
      return LINKED_AWAY;
    }

    if (!isLink(path.join(ws.root, placed))) {
      return ws.read(file);
    }

    const target = pointedAt(ws.root, placed);

    return target === undefined ? LINKED_AWAY : `${LINKED}${target}`;
  };
}

/** Whether a folder of the path, below the project root, is a symbolic link. */
function crossesLink(root: string, file: string): boolean {
  const parts = file.split('/').slice(0, -1);

  return parts.some((_part, at) => isLink(path.join(root, ...parts.slice(0, at + 1))));
}

function isLink(absolute: string): boolean {
  try {
    return fs.lstatSync(absolute).isSymbolicLink();
  } catch {
    return false;
  }
}

/** The text a link points at, when it is a file of the project that is no link itself, nor under one. */
function pointedAt(root: string, file: string): string | undefined {
  try {
    const project = fs.realpathSync(root);
    const written = fs.readlinkSync(path.join(root, file));
    const target = path.resolve(path.join(project, path.dirname(file)), written);
    const inProject = path.relative(project, target);
    const isInProject = !inProject.startsWith('..') && !path.isAbsolute(inProject);

    return isInProject && !isLink(target) && !crossesLink(project, inProject)
      ? fs.readFileSync(target, 'utf8')
      : undefined;
  } catch {
    return undefined;
  }
}
