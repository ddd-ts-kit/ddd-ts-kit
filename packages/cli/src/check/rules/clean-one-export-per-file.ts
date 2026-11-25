import path from 'node:path';
import type { ExportVerdict } from '../exports/export-verdict';
import { judgeExports } from '../exports/judge-exports';
import { kebabCaseOf } from '../exports/kebab-case-of';
import { matchesGlob } from '../exports/matches-glob';
import { namedAfter } from '../exports/named-after';
import type { Finding } from '../model/finding';
import type { ProjectFacts } from '../model/project';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { isGeneratedContextFile } from '../support/is-generated-context-file';
import { braceDepthAt } from '../text/brace-depth-at';

const STATEMENT =
  /^(?:export\b|import\b|(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s)/gm;

const EXPORT_LIST = /^export\s*(?:type\s*)?\{([^}]*)\}\s*(from\b)?/;

const ENTRY_FIX =
  'Keep only re-exports here (`export { x } from`, `export * from`, `export type { X } from`) and declare this in a file named after it: an entry file says what a folder offers, nothing lives in it.';

const COUNT_FIX =
  'Keep one and move each other to its own file named after it; only the types of its signature stay next to it. Exports that really are one thing are listed, with their reason, under "onePerFile.allow" in ddd-ts-kit.config.json.';

export const cleanOneExportPerFile: FileRule = {
  id: 'clean/one-export-per-file',
  description:
    'One exported class, interface or function per file, the file named after it in kebab-case; an index file only re-exports. The types of a signature and the small closed families are read as text: an approximation of what ESLint holds.',
  severity: 'error',
  doc: {
    why: 'A file that exports one thing is named after it, found by its name and changed for one reason. A second exported class or function is a second responsibility hiding behind the first name. The companions that stay are the ones that are not a second thing: the types of its signature, its contract constants, a type sharing its name, and a small closed family (a type with its constructors, the accessors of one private state). An index file only re-exports: it says what a folder offers. Tests are not judged. This checker reads declarations as text, so the allowances are an approximation; ESLint is authoritative, and what neither can express is listed with its reason under "onePerFile.allow".',
    bad: `// application/ports/gateways.port.ts
export abstract class PaymentGateway {}
export abstract class TaxGateway {}
// domain/services/helpers.service.ts
export class InvoiceNumbering {}`,
    good: `// application/ports/payment-gateway.port.ts
export abstract class PaymentGateway {}
// application/ports/tax-gateway.port.ts
export abstract class TaxGateway {}
// application/commands/issue-invoice/issue-invoice.result.ts
export interface IssueInvoiceResult { readonly invoiceId: string }`,
  },
  scope: 'file',
  standalone: true,
  judge(file, project) {
    if (!isJudged(file, project)) {
      return [];
    }

    if (isGeneratedContextFile(file)) {
      return [];
    }

    return isEntry(file) ? declaredInEntry(file) : judged(file, project);
  },
};

/** Sources under the source root, or under a directory named like it when there is no project around: tests are not judged. */
function isJudged(file: SourceFile, project: ProjectFacts): boolean {
  const segments = file.path.split('/');
  const root = project.config.sourceRoot;

  if (file.isTest || segments.includes('test')) {
    return false;
  }

  return file.path.startsWith(`${root}/`) || segments.slice(0, -1).includes(path.posix.basename(root));
}

/** `index.ts` at any depth. */
function isEntry(file: SourceFile): boolean {
  return /^index\.[cm]?ts$/.test(path.posix.basename(file.path));
}

/** Everything of an entry file that is not a re-export, an import without binding or the empty `export {};`. */
function declaredInEntry(file: SourceFile): Finding[] {
  const { code } = file.scan;

  return [...code.matchAll(STATEMENT)]
    .filter((match) => braceDepthAt(code, match.index) === 0 && !isAllowedInEntry(code.slice(match.index)))
    .map((match) => ({
      line: file.scan.lineAt(match.index),
      message: `The entry file holds ${match[0].startsWith('import') ? 'an import with bindings' : 'a declaration'}: an entry file only re-exports.`,
      fix: ENTRY_FIX,
    }));
}

function isAllowedInEntry(statement: string): boolean {
  if (/^import\s*['"`]/.test(statement) || /^export\s*(?:type\s*)?\*/.test(statement)) {
    return true;
  }

  const list = EXPORT_LIST.exec(statement);

  return list !== null && (list[2] !== undefined || (list[1] ?? '').trim() === '');
}

function judged(file: SourceFile, project: ProjectFacts): Finding[] {
  const verdict = judgeExports(file);
  const allowed = project.config.onePerFile.allow.some((allowance) => matchesGlob(allowance.file, file.path));

  return [...(verdict.explained || allowed ? [] : tooMany(verdict)), ...misnamed(file, verdict)];
}

function tooMany({ counted }: ExportVerdict): Finding[] {
  const [, second] = counted;

  /* v8 ignore next 3 -- ADR-0001: judgeExports explains a lone export, so there are at least two here */
  if (second === undefined) {
    return [];
  }

  return [
    {
      line: second.line,
      message: `The file exports ${counted.length} classes, interfaces or functions (${counted.map(({ name }) => name).join(', ')}).`,
      fix: COUNT_FIX,
    },
  ];
}

function misnamed(file: SourceFile, { mains }: ExportVerdict): Finding[] {
  const base = path.posix.basename(file.path);
  const stem = base.replace(/\.[cm]?ts$/, '');
  const [first] = mains;

  if (first === undefined || mains.some(({ name }) => name === 'default' || namedAfter(stem, name))) {
    return [];
  }

  const expected = kebabCaseOf(first.name);

  return [
    {
      line: first.line,
      message: `"${base}" is not named after what it exports (${mains.map(({ name }) => name).join(', ')}).`,
      fix: `Rename the file ${expected}.ts (${expected}.<role>.ts in a role directory, when the name does not already end with the role), or rename the export after the file: a file is found by the name of what it holds.`,
    },
  ];
}
