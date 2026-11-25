import { StartFromRefusedError } from '../errors/start-from-refused-error';

/** Where a consumer group that has no position yet starts: the whole history, or what is published from then on. */
export type StartFrom = 'beginning' | 'end';

/** The words the option took before the brokers shared one vocabulary, each with the word that replaced it. */
const FORMER: Readonly<Record<string, StartFrom>> = { earliest: 'beginning', latest: 'end' };

/** The word as given, when it is one the option takes; a former or an unknown word is refused by name. */
export function startFromOf(given: string): StartFrom {
  if (given === 'beginning' || given === 'end') {
    return given;
  }

  const replacement = FORMER[given];

  throw new StartFromRefusedError(given, replacement === undefined ? undefined : `'${replacement}'`);
}
