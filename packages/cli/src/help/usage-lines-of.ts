import { COMMANDS } from '../commands';

/** The lines of the usage a command declares, as the help prints them; none for a name no command has. */
export function usageLinesOf(command: string): string[] {
  return (COMMANDS.find(({ spec }) => spec.name === command)?.spec.usage ?? []).map((line) => `  ${line}`);
}
