import type { Config } from '../../../config';
import type { Workspace } from '../../../workspace';
import { projectReader } from './project-reader';
import { type Sources, sourcesOf } from './sources-of';

/**
 * The one resolver over the files a workspace holds, each by the path the workspace reads it at. A
 * file that is a symbolic link on disk is no text the kit reads (`projectReader`).
 */
export function workspaceSources(ws: Workspace, config: Config): Sources {
  return sourcesOf(config, projectReader(ws), (file) => ws.placed(file));
}
