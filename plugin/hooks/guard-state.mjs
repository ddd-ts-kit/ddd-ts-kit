// What the guard keeps between two calls, in the kit's ignored folder of a project or under the common
// git directory of its repository: the state files of a worker, and the markers of what was said once.
// Every mode but post-write reads it.
import { createHash } from 'node:crypto';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { filesIn, isDirectory } from './disk.mjs';
import { sessionOf } from './hook-input.mjs';
import { linkedFolder, removeKitFile, writeKitFile } from './kit-files.mjs';
import { commonDirOf } from './repository.mjs';

// Where the guard keeps the state of a worker between two of its calls: the kit's ignored folder.
export const GUARD_STATE = '.ddd-ts-kit/guard';
// The markers of what was said or refused once, in the guard's folder of the project, kept a week.
const GUARD_MARKERS = `${GUARD_STATE}/markers`;
const MARKER_TTL = 7 * 24 * 3600 * 1000;
// The state of the runs of a builder, by session and agent: kept a week too.
const BUILDER_STATE = /^(?:turns|before-run|outside|scope)-[0-9a-f]{16}\.json$/;
// The content a worker's command found already changed outside its scope, kept so it can be put back.
export const GUARD_HELD = `${GUARD_STATE}/held`;

// The state of a worker kept between two calls of the guard, in the kit's ignored folder of its
// worktree rather than a shared temporary directory.
export function stateFile(kind, project, input) {
  const key = createHash('sha256')
    .update(`${input.session_id ?? ''}\0${input.agent_id ?? ''}`)
    .digest('hex')
    .slice(0, 16);
  return join(project.root, GUARD_STATE, `${kind}-${key}.json`);
}

// The state of a worker that its working directory must not move, its pin and the count of its run:
// under the common git directory of the repository, which every worktree of it shares and no
// project holds, so that a call finds it from whichever checkout it starts in. Outside a repository
// there is one checkout, and the guard's folder of the project holds it.
export function sharedStateFile(kind, home, input) {
  const shared = sharedStateFolder(home.root);
  return shared ? join(shared, basename(stateFile(kind, home, input))) : stateFile(kind, home, input);
}

function sharedStateFolder(root) {
  const common = commonDirOf(root);
  return common && isDirectory(join(common, 'objects')) ? join(common, 'ddd-ts-kit', 'guard') : undefined;
}

export function writeState(file, state) {
  writeKitFile(file, JSON.stringify(state));
}

export function reminderMarker(project, input) {
  const key = createHash('sha256')
    .update(`${project.root}\n${sessionOf(input)}`)
    .digest('hex')
    .slice(0, 24);
  return markerOf(project, 'commit-reminder', key);
}

export function markerOf(project, kind, key) {
  return join(project.root, GUARD_MARKERS, `${kind}-${key}`);
}

// Leaves the marker and says whether it was there, in one exclusive creation that never follows nor
// rewrites a file put under its name, in a folder that is no link. Only the marker found there counts
// as remembered: one that cannot be left (a folder that is a link, a checkout that cannot be written)
// leaves what it guards said, or refused, again.
export function alreadyRemembered(marker) {
  if (linkedFolder(marker)) {
    return false;
  }
  try {
    mkdirSync(dirname(marker), { recursive: true });
  } catch {
    return false;
  }
  try {
    writeFileSync(marker, '', { flag: 'wx', mode: 0o600 });
    return false;
  } catch (error) {
    return error?.code === 'EEXIST';
  }
}

export function forget(marker) {
  removeKitFile(marker);
  return undefined;
}

// The markers and the runs of builders a week old, left by sessions and agents that ended, in the
// guard's folder of the project and in the one its repository shares, never through a folder that is a link.
export function pruneGuardState(root) {
  const state = join(root, GUARD_STATE);
  const markers = join(root, GUARD_MARKERS);
  const files = [
    ...[state, sharedStateFolder(root)]
      .filter(Boolean)
      .flatMap((folder) => filesIn(folder).filter((file) => BUILDER_STATE.test(relative(folder, file)))),
    ...filesIn(markers),
    ...filesIn(join(root, GUARD_HELD)),
  ];
  const before = Date.now() - MARKER_TTL;
  for (const file of files.filter((path) => statSync(path, { throwIfNoEntry: false })?.mtimeMs < before)) {
    removeKitFile(file);
  }
}
