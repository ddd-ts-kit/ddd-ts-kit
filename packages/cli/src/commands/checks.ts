import { baselineCommand } from '../check/commands/baseline-command';
import { checkCommand } from '../check/commands/check-command';
import { cleanOnlyCommand } from '../check/commands/clean-only-command';
import { selfCheckCommand } from '../check/commands/self-check';
import { withModes } from './with-modes';
import { commitSizeCommand } from './commit-size';

/**
 * `check`: the architecture rules on the project, and four other commands under its name, each
 * chosen by the option that names it and reading its own options alone: the baseline rewritten,
 * directories judged outside any project, the size of the commit in progress, and the fixtures of
 * the rules replayed.
 */
export const checksCommand = withModes(checkCommand, {
  baseline: baselineCommand,
  'clean-only': cleanOnlyCommand,
  'commit-size': commitSizeCommand,
  self: selfCheckCommand,
});
