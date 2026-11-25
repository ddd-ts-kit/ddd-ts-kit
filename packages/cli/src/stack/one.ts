import { toName } from '../naming';

/**
 * One boolean per option, true for the chosen one: what a template tests with `{{#if stack.option}}`.
 * The options are the constant of the family in the config, so that a member added there is a
 * condition the templates know.
 */
export function one<T extends string>(value: NoInfer<T>, options: readonly T[]): Record<string, boolean> {
  return Object.fromEntries(options.map((option) => [toName(option).camel, option === value]));
}
