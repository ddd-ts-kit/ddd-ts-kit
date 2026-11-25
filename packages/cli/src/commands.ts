import type { Command } from './commands/command';
import { initCommand } from './commands/init';
import { generateCommand } from './commands/generate';
import { listCommand } from './commands/list';
import { describeCommand } from './commands/describe';
import { statusCommand } from './commands/status';
import { doctorCommand } from './commands/doctor';
import { todoCommand } from './commands/todo';
import { planWavesCommand } from './commands/plan-waves';
import { storyCheckCommand } from './commands/story-check';
import { acceptanceCommand } from './commands/acceptance';
import { workerScopeCommand } from './commands/worker-scope';
import { storyScopeCommand } from './commands/story-scope';
import { storyCommand } from './commands/story';
import { storiesCommand } from './commands/stories';
import { digestCommand } from './commands/digest';
import { measuresCommand } from './commands/measures';
import { mutationCommand } from './commands/mutation';
import { worktreeCommand } from './commands/worktree';
import { verifySliceCommand } from './commands/verify-slice';
import { citedCommand } from './commands/cited';
import { verifyMergeCommand } from './commands/verify-merge';
import { mergeTrunkCommand } from './commands/merge-trunk';
import { docsCommand } from './commands/docs';
import { sdkCommand } from './commands/sdk';
import { depcruiseConfigCommand } from './commands/depcruise-config';
import { tscCommand } from './commands/tsc';
import { buildAliasesCommand } from './commands/build-aliases';
import { drizzleGenerateCommand } from './commands/drizzle-generate';
import { knexGenerateCommand } from './commands/knex-generate';
import { prismaClientCommand } from './commands/prisma-client';
import { prismaGenerateCommand } from './commands/prisma-generate';
import { typeormGenerateCommand } from './commands/typeorm-generate';
import { errorFactoriesCommand } from './commands/error-factories';
import { controllersCommand } from './commands/controllers';
import { valueObjectsCommand } from './commands/value-objects';
import { platformFoldersCommand } from './commands/platform-folders';
import { moveToModuleCommand } from './commands/move-to-module';
import { contextLayoutCommand } from './commands/context-layout';
import { affectedCommand } from './commands/affected';
import { checksCommand } from './commands/checks';
import { checkFileCommand, explainCommand, rulesCommand } from './commands/check';
import { lintCommand } from './commands/lint';

/**
 * Every command of the CLI, in the order the reference lists them: the one list of the commands.
 * What is said of a command (its name, what it takes, its usage, the lock it takes) is in its
 * declaration, which the entry, the help and the reference read from here.
 */
export const COMMANDS: readonly Command[] = [
  initCommand,
  generateCommand,
  listCommand,
  describeCommand,
  statusCommand,
  doctorCommand,
  todoCommand,
  planWavesCommand,
  storyCheckCommand,
  acceptanceCommand,
  workerScopeCommand,
  storyScopeCommand,
  storyCommand,
  storiesCommand,
  digestCommand,
  measuresCommand,
  mutationCommand,
  worktreeCommand,
  verifySliceCommand,
  citedCommand,
  verifyMergeCommand,
  mergeTrunkCommand,
  docsCommand,
  sdkCommand,
  depcruiseConfigCommand,
  tscCommand,
  buildAliasesCommand,
  drizzleGenerateCommand,
  knexGenerateCommand,
  prismaClientCommand,
  prismaGenerateCommand,
  typeormGenerateCommand,
  errorFactoriesCommand,
  controllersCommand,
  valueObjectsCommand,
  platformFoldersCommand,
  moveToModuleCommand,
  contextLayoutCommand,
  affectedCommand,
  checksCommand,
  checkFileCommand,
  lintCommand,
  rulesCommand,
  explainCommand,
];
