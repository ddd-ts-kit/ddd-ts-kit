import { formatStories } from '../stories/format-stories';
import { readStories } from '../stories/read-stories';
import { defineCommand } from './command';
import { stdoutJson } from '../json/stdout-json';

/**
 * The stories open in the worktrees of the repository and where they meet: the contexts and the
 * files two of them change, what merging the branch of one into the other would leave to a
 * person, and how far each is behind its trunk. From the worktree of a story, the stories it
 * meets. Reads, never writes.
 */
export const storiesCommand = defineCommand({
  name: 'stories',
  options: {},
  run(args, io) {
    const view = readStories(args.projectRoot);

    io.out(args.json ? stdoutJson(view) : formatStories(view, args.projectRoot));

    return 0;
  },
});
