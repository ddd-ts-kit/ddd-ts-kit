import type { OptionSpec, OptionSpecs } from './arguments';

/** What the usage of a command is written from, when nobody wrote it by hand. */
interface Shown {
  readonly name: string;
  readonly positionals?: string;
  readonly options: OptionSpecs;
}

/**
 * The usage line the declaration of a command says in full: its name, its positional arguments,
 * then each option between brackets with what it takes, in the order it declares them.
 */
export function usageLine({ name, positionals, options }: Shown): string {
  const taken = Object.entries(options).map(([option, spec]) => `[--${option}${valueOf(option, spec)}]${again(spec)}`);

  return ['ddd-ts-kit', name, ...(positionals === undefined ? [] : [positionals]), ...taken].join(' ');
}

/** What a text takes: the values it names, or the word that stands for its value. */
function valueOf(option: string, spec: OptionSpec): string {
  return spec.type === 'boolean' ? '' : ` ${spec.values?.join('|') ?? spec.value ?? `<${option}>`}`;
}

function again(spec: OptionSpec): string {
  return spec.type === 'string' && spec.multiple === true ? '...' : '';
}
