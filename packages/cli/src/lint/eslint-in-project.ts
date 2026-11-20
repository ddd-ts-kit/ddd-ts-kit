export const LINT_RUN_VARIABLE = 'DDD_TS_KIT_LINT_RUN';

/** The file the process that runs ESLint writes its answer to: its standard output belongs to the plugins of the project, which may print there. */
export const LINT_ANSWER_VARIABLE = 'DDD_TS_KIT_LINT_ANSWER';

/**
 * The ESLint of the project, through its API, which is asynchronous where a command of the CLI is
 * not: run by `node --input-type=module --eval`, so that it is the same script from the sources and
 * from the build. A formatter that writes its own file (`gitlab`) writes it here. The cache of
 * ESLint, keyed by the content of each file, lives where the command prepared it. The answer goes
 * to a file of its own, since a plugin may print on standard output (`@nx/enforce-module-boundaries`
 * warns there while the graph of Nx is not cached).
 */
export const ESLINT_IN_PROJECT = `
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { root, patterns, ignored, format, fix, cache } = JSON.parse(process.env.${LINT_RUN_VARIABLE});
const entry = createRequire(path.join(root, 'package.json')).resolve('eslint');
const { ESLint } = await import(pathToFileURL(entry).href);
const withCache = cache === undefined ? {} : { cache: true, cacheLocation: cache, cacheStrategy: 'content' };
const leftOut = ignored.length === 0 ? {} : { overrideConfig: [{ ignores: ignored }] };
const eslint = new ESLint({ cwd: root, fix, ...withCache, ...leftOut });
const answer = (value) => fs.writeFileSync(process.env.${LINT_ANSWER_VARIABLE}, JSON.stringify(value));
const stop = (refusal) => {
  answer({ refusal });
  process.exit(0);
};
const results = await eslint.lintFiles(patterns.length === 0 ? ['.'] : patterns).catch((error) =>
  error?.messageTemplate === 'file-not-found' ? stop('no-files') : Promise.reject(error),
);

if (fix) {
  await ESLint.outputFixes(results);
}

const rulesMeta = eslint.getRulesMetaForResults(results);
const formatter = await eslint.loadFormatter(format).catch((error) =>
  error?.code === 'ERR_MODULE_NOT_FOUND' ? stop('formatter') : Promise.reject(error),
);
const report = await formatter.format(results, { cwd: root, rulesMeta });
const messages = results.flatMap((result) => result.messages.map(({ ruleId, severity }) => ({ ruleId, severity })));

answer({ report, messages });
`;
