/**
 * `--term "<Term>=<meaning>"`, given once per row: the option of the kinds whose names are held to
 * the glossary of the context, a word it does not define joining it in the same command.
 */
export const TERM = { type: 'string', multiple: true, value: '"<Term>=<meaning>"' } as const;
