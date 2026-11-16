/**
 * What a reader of the project answers for a file that is a symbolic link, in a commit (mode
 * 120000) or on disk: no text of the project, which a NUL keeps from being one. The kit does not
 * follow a link: a tables file that is one is not read with certainty. The text a link to a file of
 * the project points at follows the marker, only for a word to be found in.
 */
export const LINKED = '\0a symbolic link\0';

/**
 * What a reader answers for a link whose text it does not look into: one that leads out of the
 * project, to another link or to nothing, and a file under a folder that is a link. It may export
 * any name.
 */
export const LINKED_AWAY = `${LINKED}\0`;
