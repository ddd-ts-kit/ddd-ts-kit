import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as kernel from '../../src';

const SOURCES = fileURLToPath(new URL('../../src/', import.meta.url));

/**
 * The codes the refusals of the kernel carry, read in its sources: in each file that declares a
 * `DomainError`, the text given to `code`, the constant given to it, and the first argument of
 * each `refusal(..)` of a concept error.
 */
export function refusalCodesOfSources(): string[] {
  const codes = sourceFiles().filter(declaresRefusal).map(withoutComments).flatMap(codesWrittenIn);

  return [...new Set(codes)].sort();
}

function sourceFiles(): string[] {
  return readdirSync(SOURCES, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .map((file) => readFileSync(`${SOURCES}${file}`, 'utf8'));
}

function declaresRefusal(source: string): boolean {
  return [...source.matchAll(/^export (?:abstract )?class (\w+)/gm)].some(([, name]) => isRefusalClass(name));
}

function isRefusalClass(name: string | undefined): boolean {
  const exported: unknown = Object.entries(kernel).find(([key]) => key === name)?.[1];

  return typeof exported === 'function' && exported.prototype instanceof kernel.DomainError;
}

/** The samples of a comment name codes of a project, not of the kernel. */
function withoutComments(source: string): string {
  return source.replaceAll(/^\s*(?:\/\*\*|\*|\/\/).*$/gm, '');
}

function codesWrittenIn(source: string): string[] {
  const written = [...source.matchAll(/\bcode = '(\w+)'|\.refusal\(\s*'(\w+)'/g)].map(([, a, b]) => a ?? b);

  const named = [...source.matchAll(/\bcode = ([A-Z_]+);/g)].map(
    ([, constant]) => new RegExp(`const ${String(constant)} = '(\\w+)'`).exec(source)?.[1],
  );

  return [...written, ...named].filter((code) => code !== undefined);
}
