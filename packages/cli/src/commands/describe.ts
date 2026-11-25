import { readConfig } from '../config';
import { describeContext } from '../describe/describe-context';
import { formatDescription } from '../describe/format-description';
import { readContext } from '../docs/read-context';
import { Workspace } from '../workspace';
import { defineCommand } from './command';
import { knownContext } from './known-context';
import { stdoutJson } from '../json/stdout-json';

/** Prints what one context holds, read from the config and the source text: the facts an agent needs before it opens a file. */
export const describeCommand = defineCommand({
  name: 'describe',
  options: {},
  run(args, io) {
    const root = args.projectRoot;
    const { config } = readConfig(root);
    const ws = new Workspace(root, false);
    const description = describeContext(ws, config, readContext(ws, config, knownContext(config, args.positionals[0])));

    io.out(args.json ? stdoutJson(description) : formatDescription(description));

    return 0;
  },
});
