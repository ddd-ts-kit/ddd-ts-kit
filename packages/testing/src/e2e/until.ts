import { AssertionError } from 'node:assert';
import { eventually, type EventuallyOptions } from './eventually';

/**
 * Waits until the condition holds, for outcomes seen from the outside (a counter, a list): the
 * same polling as `eventually`, the condition returns a boolean instead of asserting. A condition
 * never met is an assertion that failed, which `pending` reads as a scenario waiting for its code.
 */
export async function until(
  condition: () => boolean | Promise<boolean>,
  options: EventuallyOptions = {},
): Promise<void> {
  await eventually(async () => {
    if (!(await condition())) {
      throw new AssertionError({ message: 'The condition was not met', operator: 'until' });
    }
  }, options);
}
