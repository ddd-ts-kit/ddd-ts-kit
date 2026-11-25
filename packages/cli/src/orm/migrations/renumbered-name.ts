import { numberedName } from './numbered-name';

/** The name of a migration under another number, its `working-` prefix gone; nothing when it starts with no number. */
export function renumberedName(name: string, number: string): string | undefined {
  const numbered = numberedName(name);

  return numbered === undefined ? undefined : `${number}${numbered.rest.replace(/^([_.-])working[_-]/, '$1')}`;
}
