import type { Name } from '../../../naming';
import type { Scope } from '../../scope';
import { readerFile } from '../reader-file';

/**
 * The files a use case runs through that are still as their generator left them, each refusing
 * until its decision is written: its handler and, for a query, its reader; or, for a use case an
 * integration event starts, the handler of that event, then the handler of the command once the
 * first one sends it.
 */
export function stillRefusing(scope: Scope, name: Name, starter?: string): string[] {
  const { dir, ws } = scope;
  const command = `${dir}/application/commands/${name.kebab}/${name.kebab}.handler.ts`;
  const refuses = (file: string): boolean => ws.read(file)?.includes('throw undecided(') === true;

  if (starter !== undefined) {
    const sends = new RegExp(String.raw`\b${name.pascal}Command\b`).test(ws.read(starter) ?? '');

    return [starter, ...(sends ? [command] : [])].filter(refuses);
  }

  return [
    command,
    `${dir}/application/queries/${name.kebab}/${name.kebab}.handler.ts`,
    `${dir}/infrastructure/persistence/${readerFile(scope, name)}.ts`,
  ].filter(refuses);
}
