import { CliError } from '../../cli-error';
import { parseConceptName, type Name } from '../../naming';
import { VAGUE_REFUSAL_NAMES } from './vague-refusal-names';

/**
 * The name of a refusal class under `"stack.refusals": "named"`, from `InsufficientFunds`,
 * `insufficient-funds` or `InsufficientFundsError`: what is refused, in PascalCase, never ending
 * in `Error`. Its words are judged against the glossary once its code is known (`writeNamedRefusal`).
 */
export function refusalClassName(input: string): Name {
  // Judged as typed first: `Error` and `New` are told what a refusal is named after, not that the language keeps them.
  if (isVague(input)) {
    throw vague(input);
  }

  const name = parseConceptName(input, 'refusal', { strip: ['error'] });

  if (isVague(name.camel) || name.pascal.endsWith('Error')) {
    throw vague(input);
  }

  return name;
}

const isVague = (written: string): boolean => VAGUE_REFUSAL_NAMES.includes(written.replace(/[-_ ]/g, '').toLowerCase());

function vague(input: string): CliError {
  return new CliError(
    `"${input}" says that an error is built, not what is refused.`,
    'Name the class after the refusal, as a domain expert says it: InsufficientFunds, SlotTaken, AppointmentEnded (rule errors/factory-name).',
  );
}
