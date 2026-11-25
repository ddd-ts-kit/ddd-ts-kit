// The rules on one place a call writes, whatever the tool (the editor tools, a patch, the shell), as
// rows of a table (rule-table.mjs). Each reads the subject `{ project, file, input }`, and `below`
// when a command writes a whole folder. The tables that ask them, and in what order, are those of
// pre-write (guard.mjs) and of the shell (shell-rules.mjs).
import { storyCodeReason, worktreeCodeReason } from './story-rules.mjs';
import { linkReason, workerScopeReason } from './worker-scope.mjs';
import {
  baselineFileReason,
  generatedFileReason,
  handWrittenRoleReason,
  scopeFileReason,
  testWriterScopeReason,
} from './write-rules.mjs';

export const baselineFileRule = {
  id: 'baseline-file',
  reason: ({ project, file }) => baselineFileReason(project, file),
};

export const scopeFileRule = {
  id: 'scope-file',
  reason: ({ project, file, below, input }) => scopeFileReason(project, { place: file, below }, input),
};

export const generatedFileRule = {
  id: 'generated-file',
  reason: ({ project, file }) => generatedFileReason(project, file),
};

export const workerScopeRule = {
  id: 'worker-scope',
  reason: ({ project, file, input }) => workerScopeReason(project, file, input),
};

export const scopeLinkRule = {
  id: 'scope-link',
  reason: ({ project, file, input }) => linkReason(project, file, input),
};

export const testWriterScopeRule = {
  id: 'test-writer-scope',
  reason: ({ project, file, input }) => testWriterScopeReason(project, file, input),
};

export const storyCodeRule = {
  id: 'story-code',
  reason: ({ project, file }) => storyCodeReason(project, file),
};

export const worktreeCodeRule = {
  id: 'worktree-code',
  reason: ({ project, file }) => worktreeCodeReason(project, file),
};

export const handWrittenRoleRule = {
  id: 'hand-written-role',
  reason: ({ project, file }) => handWrittenRoleReason(project, file),
};
