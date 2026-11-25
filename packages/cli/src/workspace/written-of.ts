import { cannotWrite } from './cannot-write';
import type { DiskWrites } from './disk-writes';
import type { RealPath } from './real-path-of';
import { stageIfAllowed, type StagedFile } from './stage-if-allowed';

/** One file of the plan of a command: its path in the project, its new content, whether it was on disk. */
export interface PlannedFile {
  readonly file: string;
  readonly content: string;
  readonly existed: boolean;
}

/** How the plan is written: for real or not (dry run), where each file lands, its real path resolved once, and the disk that holds them. */
export interface PlanWriting {
  readonly dryRun: boolean;
  readonly absolute: (file: string) => string;
  readonly real: ReadonlyMap<string, RealPath>;
  readonly disk: DiskWrites;
}

/**
 * The planned files written, or (dry run) that could be: the others go to `unwritten`. The plan
 * lands whole or not at all: every file is written beside its place first, and moved into place
 * only once all of them are, so that a write that fails (a full disk) leaves the project as it
 * stood, with no temporary file and no folder made for one. Only a move that fails after others
 * succeeded can leave a part of the plan, and it is thrown.
 */
export function writtenOf(planned: readonly PlannedFile[], writing: PlanWriting, unwritten: string[]): PlannedFile[] {
  const staged = writing.dryRun ? [] : stagedOf(planned, writing);

  try {
    return planned.filter(({ file }, index) => {
      const isWritable = writing.dryRun ? !cannotWrite(writing.absolute(file)) : staged[index]?.land() === true;

      if (!isWritable) {
        unwritten.push(file);
      }

      return isWritable;
    });
  } finally {
    discardAll(staged);
  }
}

/** Each file of the plan written beside its place, undefined for one this process may not write; nothing is left when one fails. */
function stagedOf(planned: readonly PlannedFile[], { absolute, real, disk }: PlanWriting): (StagedFile | undefined)[] {
  const staged: (StagedFile | undefined)[] = [];

  try {
    for (const { file, content } of planned) {
      staged.push(stageIfAllowed(absolute(file), content, { disk, real: real.get(file) }));
    }
  } catch (error) {
    discardAll(staged);

    throw error;
  }

  return staged;
}

/** From the last one: a folder made for an earlier file holds the temporary files of the later ones. */
function discardAll(staged: readonly (StagedFile | undefined)[]): void {
  staged.toReversed().forEach((file) => file?.discard());
}
