import type { OptionSpec, OptionSpecs } from './arguments';

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
    .map(([option, spec]) => `--${option}${valueOf(option, spec)}`);

  const taken = Object.entries(options)
    .filter(([option]) => option !== mode?.chosenBy)
    .map(([option, spec]) => `[--${option}${valueOf(option, spec)}]${again(spec)}`);

  return ['ddd-ts-kit', name, ...chosenBy, ...(positionals === undefined ? [] : [positionals]), ...taken].join(' ');
}

/** What a text takes: the values it names, or the word that stands for its value. */
function valueOf(option: string, spec: OptionSpec): string {
  return spec.type === 'boolean' ? '' : ` ${spec.values?.join('|') ?? spec.value ?? `<${option}>`}`;
}

function again(spec: OptionSpec): string {
  return spec.type === 'string' && spec.multiple === true ? '...' : '';
}
