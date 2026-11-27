import { Arguments } from '../commands/arguments';
import { findKind } from './find-kind';
import { generateOptionsOf } from './generate-options-of';
import type { Kind } from './kind';

/**
 * The kind a command line asks for: the first word that names a kind and stands first among the
 * positionals once the flags are read as that kind declares them (`generate --module pricing job
 * catalog Reprice` asks for a job). A flag that is a text for one kind and a switch for another
 * takes the word after it or not as the kind named after it reads it: `--command <UseCase>` of a
 * job, `--command` of a route.
 */
export function kindIn(argv: readonly string[]): Kind | undefined {
  const named = argv.flatMap((word) => {
    const kind = word.startsWith('-') ? undefined : findKind(word);

    return kind === undefined ? [] : [kind];
  });

  return named.find((kind) => findKind(Arguments.positionalsOf(argv, generateOptionsOf(kind))[0] ?? '') === kind);
}
