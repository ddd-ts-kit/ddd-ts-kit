import { readConfig } from '../config';
import { formatCommitSize } from '../commit/format-commit-size';
import { measureCommit } from '../commit/measure-commit';
import { defineCommand } from './command';
import { stdoutJson } from '../json/stdout-json';

/** `check --commit-size`: says whether what is about to be committed fits one slice. Advisory unless `--strict`. */
export const commitSizeCommand = defineCommand({
  name: 'check',
  usage: ['ddd-ts-kit check --commit-size [--staged] [--strict]'],
  options: {
    'commit-size': { type: 'boolean' },
    staged: { type: 'boolean' },
    strict: { type: 'boolean' },
  },
  run(args, io) {
    const root = args.projectRoot;
    const size = measureCommit(root, readConfig(root).config, args.flag('staged'));

    io.out(args.json ? stdoutJson(size) : formatCommitSize(size));

    return size.over && args.flag('strict') ? 1 : 0;
  },
});
