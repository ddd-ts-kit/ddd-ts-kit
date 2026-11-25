// The state of one call of the guard. A process of the guard answers one hook, then ends: what that
// call learns on its way is kept here, in one object, so that a module says `call.<field>` where it
// reads or sets it. `main` sets the input; the mode that runs sets the rest. Every mode loads it.
export const call = {
  // The input of the call, for the root of its session.
  input: {},
  // The end of the time of a session start for the CLI, and whether a call was skipped or stopped for it.
  briefingEnds: undefined,
  briefingCut: false,
  // The seconds after which a run of the CLI was stopped, by its command: the stop says it of `check`.
  timedOut: new Map(),
  // The commands of the CLI whose answer was past what the guard reads: the stop says it of `check`.
  oversized: new Set(),
  // The reader of shell commands, loaded only when a worker runs one: every other call of the guard skips its cost.
  shell: undefined,
  // The notice due to a context-builder near its turn limit, said with the decision of the call or alone.
  notice: undefined,
};
