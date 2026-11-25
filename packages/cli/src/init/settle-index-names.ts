import type { Config } from '../config';
import { indexPicture } from '../generate/kinds/same-name/index-picture';
import { ORM_MEMBERS } from '../orm/orm-members';
import { Workspace } from '../workspace';

/**
 * Two contexts that export a table of the same name: an index that lost the lines that tell them
 * apart, or never had them (a project of an earlier version, two branches merged by hand), names
 * each again, once every context is listed in it, and says so in one note per name or refusal.
 * A table the index gave before the command and gives no more, or a name that would come to export
 * another table, puts the index back as it stood on disk: the lines a team wrote by hand stay.
 */
export function settleIndexNames(ws: Workspace, config: Config): void {
  // What the index gave before this command wrote anything: `init --force` rewrites it from its template, lines by hand included.
  const disk = new Workspace(ws.root, false);
  const before = indexPicture(disk, config);
  const unseen = before.text === undefined ? [] : handLinesUnseen(ws, config, before.text);

  if (before.text !== undefined && unseen.length > 0) {
    ws.leave(`${config.platformDir}/database/schema.ts`, before.text);
    unseen.forEach((note) => ws.note(note));

    return;
  }

  const said = ORM_MEMBERS[config.stack.orm].tables?.indexNames?.settled(ws, config) ?? [];

  // What the command ends with is compared with what the index gave on disk at its end, once (`keepThePicture`).
  said.forEach((note) => {
    ws.note(note);
  });
}

const REGION = /(\/\/ ddd-ts-kit:[\w-]+\n)[\s\S]*?(\/\/ \/ddd-ts-kit:[\w-]+)/g;

/**
 * `init --force` writes the index again from its template: what a team wrote outside the regions
 * of the kit goes. Where that part of the index on disk holds something the kit does not read
 * with certainty (on Drizzle an `export` it does not answer for or a module re-exported whole it
 * does not follow, on TypeORM an entry of `entities` the template does not write), the picture of
 * the index cannot tell what would be lost: the index is left as it stood, and one sentence says
 * so. Answers nothing when the rewrite drops no such line.
 */
function handLinesUnseen(ws: Workspace, config: Config, onDisk: string): string[] {
  const index = `${config.platformDir}/database/schema.ts`;
  const rewritten = ws.read(index) ?? '';
  const outside = onDisk.replace(REGION, '$1$2');
  const kept = new Set(rewritten.split('\n').map((line) => line.trim()));
  const dropped = outside.split('\n').filter((line) => line.trim() !== '' && !kept.has(line.trim()));
  const names = ORM_MEMBERS[config.stack.orm].tables?.indexNames;
  const unread = dropped.length === 0 ? [] : (names?.unreadOutside(ws, config, { index, outside, rewritten }) ?? []);

  return unread.length === 0
    ? []
    : [
        `${index} is left as it stood before the command: outside the regions the kit writes it holds ${unread.join('; ')}, which the kit does not read with certainty, and \`init --force\` writes the index again from its template, without the ${dropped.length} line(s) written there by hand. Move what the kit should keep into a file of a context, or keep the index by hand.`,
      ];
}
