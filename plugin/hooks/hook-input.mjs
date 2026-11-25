// The input and the answer of a hook, for the three hosts in one place: which host and which agent
// call, the writes of a tool call file by file, the decision in the shape each host reads. Every mode
// reads it.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { call } from './call.mjs';
import { parseJson } from './disk.mjs';

// The agents of the plugin a rule knows by name, as the input of a call names them.
const WORKER_AGENT = 'context-builder';

// The builder of the plugin, as its hooks of SubagentStart and SubagentStop match it: the one counted.
const BUILDER_AGENT = `ddd-ts-kit:${WORKER_AGENT}`;

const JUDGE_AGENT = 'acceptance-judge';

// The tools of VS Code that write a file named by `filePath`, by the names its chat gives its hooks.
const VS_CODE_WRITERS = new Set([
  'create_file',
  'replace_string_in_file',
  'multi_replace_string_in_file',
  'insert_edit_into_file',
  'edit_notebook_file',
]);
// The tools of VS Code that only read, by the names its chat gives its hooks (copilot-chat 0.72): with no
// matcher, the write hooks run on them too, and a `path` there names what is read. `memory` reads when it
// views. A name not listed is read as before, so that a tool that writes, added later, is still judged
// (docs/adr/0007-the-guard-names-the-readers-of-vs-code.md).
const VS_CODE_READERS = new Set([
  'read_file',
  'view_image',
  'list_dir',
  'file_search',
  'grep_search',
  'semantic_search',
  'search_workspace_symbols',
  'get_errors',
  'get_changed_files',
  'read_project_structure',
  'copilot_getNotebookSummary',
  'read_notebook_cell_output',
  'test_search',
  'fetch_webpage',
  'github_repo',
  'github_text_search',
  'get_vscode_api',
  'search_subagent',
  'explore_subagent',
  'resolve_memory_file_uri',
]);

// The agents of the plugin that only read: they write their findings in their answer.
const READ_ONLY_AGENTS = ['architecture-reviewer', 'domain-explorer', 'story-verifier'];

export function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

// Claude Code, and Copilot or VS Code under the same event names, send `tool_name` and
// `tool_input`; Codex adds a `turn_id` and edits through `apply_patch`; the hooks of Copilot
// in its own format send `toolName`, `toolArgs` and `sessionId`.
export function hostOf(input) {
  if ('toolName' in input || 'sessionId' in input) {
    return 'copilot';
  }

  return input.tool_name === 'apply_patch' || 'turn_id' in input ? 'codex' : 'claude';
}

// A tool that takes a free text, the `apply_patch` of Copilot, has that text as its input: it is
// read where the patches of the other hosts are.
export function toolInput(input) {
  if (typeof input.tool_input === 'string') {
    return { input: input.tool_input };
  }
  if (input.tool_input && typeof input.tool_input === 'object') {
    return input.tool_input;
  }
  const args = typeof input.toolArgs === 'string' ? parseJson(input.toolArgs) : input.toolArgs;

  return args && typeof args === 'object' ? args : {};
}

// A sub-agent names itself in the input of its calls; the session itself names no agent.
export function isSubAgent(input) {
  return Boolean(input.agent_type);
}

export function isWorkerAgent(input) {
  return String(input.agent_type ?? '').includes(WORKER_AGENT);
}

// The context-builder of the plugin in Claude Code: its tool calls are counted, its runs and stops recorded.
// An agent of the project named otherwise is held to the scope of a worker (`workerContext`), not counted.
export function isBuilder(input) {
  return hostOf(input) === 'claude' && input.agent_type === BUILDER_AGENT;
}

export function isTestWriter(input) {
  return String(input.agent_type ?? '').includes('domain-test-writer');
}

export function isJudge(input) {
  return String(input.agent_type ?? '').includes(JUDGE_AGENT);
}

export function isReadOnlyAgent(input) {
  return READ_ONLY_AGENTS.some((name) => String(input.agent_type ?? '').includes(name));
}

export function sessionOf(input) {
  return input.session_id ?? input.sessionId ?? '';
}

// What one call of a write tool writes, file by file, with the text it adds and the text it replaces.
// A reader of VS Code writes none.
export function writesOf(input) {
  const tool = toolInput(input);
  if (VS_CODE_READERS.has(input.tool_name) || (input.tool_name === 'memory' && tool.command === 'view')) {
    return [];
  }
  const cwd = input.cwd ?? process.cwd();
  // Codex documents the patch under `command`; the other fields are read in case it moves.
  const patch = [tool.command, tool.patch, tool.input].find(
    (text) => typeof text === 'string' && /^\s*\*\*\* Begin Patch/.test(text),
  );
  if (patch) {
    return patchWrites(patch, cwd);
  }

  return editsOf(input).map((edit) => ({ file: edit.file, written: writtenText(edit), replaced: replacedText(edit) }));
}

// What a call of an editor tool edits, as many as the files it names, each with its `file`. VS Code
// keeps no matcher, so these hooks run on its readers too, and a tool not named a reader may have a
// `filePath`: that field is read for the tools that write. Its `replacements` name their file one by
// one: those of one file are that file's `edits`, as those of a MultiEdit are.
export function editsOf(input) {
  const tool = toolInput(input);
  const cwd = input.cwd ?? process.cwd();
  const writer = VS_CODE_WRITERS.has(input.tool_name);
  if (writer && Array.isArray(tool.replacements)) {
    return replacementsByFile(tool.replacements, cwd);
  }
  const file = tool.file_path ?? tool.path ?? (writer ? tool.filePath : undefined);

  return typeof file === 'string' ? [{ ...tool, file: resolve(cwd, file) }] : [];
}

function replacementsByFile(replacements, cwd) {
  const files = new Map();
  for (const replacement of replacements.filter((named) => typeof named?.filePath === 'string')) {
    const file = resolve(cwd, replacement.filePath);
    files.set(file, [...(files.get(file) ?? []), replacement]);
  }

  return [...files].map(([file, edits]) => ({ file, edits }));
}

// The patch of Codex: `*** Add File:`, `*** Update File:` (and `*** Move to:`), `*** Delete File:`,
// each followed by its lines, `+` added and `-` removed. Its paths are relative to the session. A
// deleted file, and the file a move leaves, are writes that remove it (`deleted`). Its lines end in
// LF or CRLF and the three file headers may be indented, as the parser of Copilot takes them; an
// indented `+` line, a lower case header or a wider marker, which that parser refuses, stay unread.
export function patchWrites(patch, cwd) {
  const writes = [];
  let current;
  for (const line of patch.split(/\r?\n/)) {
    const header = /^\s*\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    const moved = /^\*\*\* Move to: (.+)$/.exec(line);
    if (header) {
      current = { file: resolve(cwd, header[2].trim()), added: [], removed: [], deleted: header[1] === 'Delete' };
      writes.push(current);
    } else if (moved && current) {
      writes.push({ file: current.file, added: [], removed: [], deleted: true });
      current.file = resolve(cwd, moved[1].trim());
    } else if (current && /^[+-]/.test(line)) {
      (line.startsWith('+') ? current.added : current.removed).push(line.slice(1));
    }
  }

  return writes.map(({ file, added, removed, deleted }) => ({
    file,
    written: added.join('\n'),
    replaced: removed.join('\n'),
    ...(deleted ? { deleted } : {}),
  }));
}

// The fields of Claude Code (`content`, `new_string`, `edits`), of Copilot (`file_text`, `new_str`)
// and of VS Code (`newString`, `code`).
function writtenText(tool) {
  const edits = Array.isArray(tool.edits) ? tool.edits.map((edit) => edit.new_string ?? edit.newString ?? '') : [];
  return [
    tool.content ?? '',
    tool.new_string ?? '',
    tool.file_text ?? '',
    tool.new_str ?? '',
    tool.newString ?? '',
    tool.code ?? '',
    ...edits,
  ].join('\n');
}

function replacedText(tool) {
  const edits = Array.isArray(tool.edits) ? tool.edits.map((edit) => edit.old_string ?? edit.oldString ?? '') : [];
  return [tool.old_string ?? '', tool.old_str ?? '', tool.oldString ?? '', ...edits].join('\n');
}

// Each host reads the decision in its own shape, which opens with the id of the rule that took it.
// Codex cannot put a question to the user: what Claude Code asks is said to the user there, and left
// to the checks of the pipeline.
export function decide(input, { decision: permissionDecision, id, reason }) {
  const permissionDecisionReason = `ddd-ts-kit [${id}]: ${reason}`;
  const host = hostOf(input);
  if (host === 'copilot') {
    return emit({ permissionDecision, permissionDecisionReason });
  }
  if (host === 'codex' && permissionDecision === 'ask') {
    return emit({ systemMessage: permissionDecisionReason });
  }
  const additionalContext = call.notice;
  call.notice = undefined;
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision,
      permissionDecisionReason,
      ...(additionalContext ? { additionalContext } : {}),
    },
  });
}

export function emit(output) {
  process.stdout.write(`${JSON.stringify(output)}\n`);
}
