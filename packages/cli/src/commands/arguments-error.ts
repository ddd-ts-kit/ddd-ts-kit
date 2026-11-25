import { CliError } from '../cli-error';

/**
 * An option or a value the parser of a command refuses: the CLI answers it with the usage of the
 * command that refused, which that command adds once it is known.
 */
export class ArgumentsError extends CliError {
  constructor(
    message: string,
    fix: string,
    /** The usage lines of the command that refused; none until the command says them. */
    readonly usage?: readonly string[],
  ) {
    super(message, fix);
  }

  /** The same refusal, answered with these usage lines. */
  answeredWith(usage: readonly string[]): ArgumentsError {
    return new ArgumentsError(this.message, this.fix, usage);
  }
}
