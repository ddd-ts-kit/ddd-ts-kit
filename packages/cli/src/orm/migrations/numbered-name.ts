const NUMBERED = /^(\d+)([\s\S]*)$/;

/** The digits the name of a migration starts with and what follows them; nothing when it starts with none. */
export function numberedName(name: string): { readonly number: string; readonly rest: string } | undefined {
  const [, number, rest] = NUMBERED.exec(name) ?? [];

  return number === undefined || rest === undefined ? undefined : { number, rest };
}
