import type { IndexPicture } from './index-picture';

/** A picture that holds nothing but the text of the index. */
export function emptyPicture(text: string | undefined): IndexPicture {
  return { text, names: new Map(), reachable: new Set(), unread: [], toTheSettle: new Set(), givers: new Map() };
}
