import type { OptionSpecs } from './arguments';
import { optionUsage } from './option-usage';

/** What the usage of a command is written from, when nobody wrote it by hand. */
interface Shown {
  readonly name: string;
  readonly positionals?: string;
  readonly mode?: { readonly chosenBy: string };
  readonly options: OptionSpecs;
}

/**
 * The usage line the declaration of a command says in full: its name, its positional arguments,
 * then each option between brackets with what it takes, in the order it declares them. A mode
 * opens with the option that chooses it, which it requires.
 */
export function usageLine({ name, positionals, mode, options }: Shown): string {
  const chosenBy = Object.entries(options)
    .filter(([option]) => option === mode?.chosenBy)
    .map(([option, spec]) => optionUsage(option, spec).required);

  const taken = Object.entries(options)
    .filter(([option]) => option !== mode?.chosenBy)
    .map(([option, spec]) => optionUsage(option, spec).optional);

  return ['ddd-ts-kit', name, ...chosenBy, ...(positionals === undefined ? [] : [positionals]), ...taken].join(' ');
}
