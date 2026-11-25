import type { OptionSpec } from './arguments';

/** How a usage line writes one option: as it is required, and as it may be left out. */
interface OptionUsage {
  /** `--baseline write|check`: the option and what it takes. */
  readonly required: string;
  /** `[--rule <id>]...`: between brackets, with `...` when it may be given again. */
  readonly optional: string;
}

/** One option as a usage line writes it, with the values it names or the word that stands for its value. */
export function optionUsage(option: string, spec: OptionSpec): OptionUsage {
  const required = `--${option}${valueOf(option, spec)}`;

  return { required, optional: `[${required}]${again(spec)}` };
}

/** What a text takes: the values it names, or the word that stands for its value. */
function valueOf(option: string, spec: OptionSpec): string {
  return spec.type === 'boolean' ? '' : ` ${spec.values?.join('|') ?? spec.value ?? `<${option}>`}`;
}

function again(spec: OptionSpec): string {
  return spec.type === 'string' && spec.multiple === true ? '...' : '';
}
