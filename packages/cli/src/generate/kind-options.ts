const SWITCH = { type: 'boolean' } as const;

/**
 * `--term "<Term>=<meaning>"`, given once per row: the option of the kinds whose names are held to
 * the glossary of the context, a word it does not define joining it in the same command.
 */
export const TERM = { type: 'string', multiple: true, value: '"<Term>=<meaning>"' } as const;

/** `--module <module>`, taken by the kinds that write the files the modules of the model of a context divide. */
export const MODULE = { type: 'string' } as const;

/** The flags of `generate` every kind takes, whatever it declares: the `generate` line of the help states them. */
export const EVERY_KIND = { 'allow-name': SWITCH, 'local-only': SWITCH, 'dry-run': SWITCH, force: SWITCH } as const;
