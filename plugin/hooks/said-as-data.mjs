// What the guard repeats of a text it read from the repository or from the CLI, said as data and never
// as a word of its own: a name when it follows its grammar, a text quoted. Every mode but post-write
// and subagent-start reads it.

// What the guard says of a text read from the repository, the plan line or a next step: at most this many characters.
const QUOTED_LIMIT = 300;
// The grammars of the names read from the repository that the guard repeats: anything else is not repeated.
export const STORY_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
export const CONTEXT_NAME = /^[a-z][a-z0-9-]*$/;
export const GIT_REF = /^(?!-)[\p{L}\p{N}_./-]+$/u;
export const COMMIT_ID = /^[0-9a-f]{7,64}$/;

// A space is allowed (a project under "My Projects"); a quote, a backquote, a dollar or a backslash is not.
export const ABSOLUTE_PATH = /^\/[\p{L}\p{N} _@%+=:,./-]*$/u;
export const LABEL = /^[a-z][a-z -]*$/;
export const AGENT_ID = /^[\w-]+$/;

// A text read from the repository (the plan, the files of a story through the CLI) said as data,
// never as a word of the guard: on one line, without backquote nor double quote, cut, never opening
// with the prefix of the guard's own decisions, between double quotes.
export function quoted(text) {
  const flat = String(text)
    .replace(/[\p{Cf}`"]/gu, '')
    .replace(/[\s\p{Cc}]+/gu, ' ')
    .replace(/^(?:\s*ddd-ts-kit\s*:)+/i, '')
    .trim();
  return `"${flat.slice(0, QUOTED_LIMIT)}"`;
}

// A name read from the repository, when it follows its grammar; else nothing, and it is not repeated.
export function named(value, grammar) {
  return typeof value === 'string' && grammar.test(value) ? value : undefined;
}
