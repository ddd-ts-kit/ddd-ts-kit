import type { Config } from '../../../config';
import type { Workspace } from '../../../workspace';
import type { IndexReading } from './index-reading';
import type { SettleOrder } from './lines-to-settle';
import { mayShare } from './may-share';
import { unreadNote } from './unread-note';

/**
 * Nothing to settle among what was read. Something that is not read with certainty may still
 * export the name of a value of a tables file: said when that name is written in it, with what
 * must hold and no line to copy (`unreadNote`). Silent otherwise.
 */
export function unseenShares(
  ws: Workspace,
  config: Config,
  { reading, settling }: { reading: IndexReading; settling: SettleOrder },
): string[] {
  const shared = reading.unread.length === 0 ? [] : mayShare(ws, config, reading);
  const names = [...new Set(shared.map(({ name }) => name))];

  return names.length === 0
    ? []
    : [
        unreadNote({
          reading,
          unread: reading.unread,
          may: names,
          shared: [],
          ...(settling.keeps === undefined ? {} : { keeps: settling.keeps }),
        }),
      ];
}
