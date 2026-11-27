import { CliError } from '../../cli-error';
import type { Config } from '../../config';
import { concept } from '../concept';
import { emit } from '../emit';
import { ERROR_CODE } from '../errors/error-code-pattern';
import { TERM } from '../kind-options';
import { named } from '../named';
import { vars } from '../vars';
import { IN_SHARED_KERNEL, SHARED_GLOSSARY } from '../shared-write';
import { defineKind } from '../define-kind';

export const domainErrorKind = defineKind({
  name: 'domain-error',
  summary:
    'One class per error, built with `new`, and its spec: the form of a project whose "stack.refusals" is "classes", or says nothing. With shared-kernel, at the root of the shared kernel.',
  scope: 'context-or-shared-kernel',
  positionals: ['Name'],
  options: { code: { type: 'string', value: 'CODE' }, term: TERM },
  shared: {
    files: ['<sharedKernelDir>/<name>.error.ts and its spec', SHARED_GLOSSARY],
    when: `${IN_SHARED_KERNEL}: the refusal of a value of the shared kernel`,
    worker: 'in its own context',
  },
  writesInModules: true,
  run: (scope, request) => {
    refuseBuiltThroughFactories(scope.config.stack.refusals, scope.context.kebab);

    const name = concept(scope, request.args[1] ?? '', {
      what: 'domain error',
      strip: ['error'],
      allowReserved: scope.flags.flag('allow-name'),
      judged: false,
    });

    const code = request.flags.text('code') ?? name.constant;

    if (!ERROR_CODE.test(code)) {
      throw new CliError(
        `"${code}" is not a valid error code.`,
        'Use upper-case words separated by underscores, for example INVOICE_ALREADY_ISSUED.',
      );
    }

    emit(scope, vars(scope, { name: named(name), error: { code } }), [
      ['domain-error/domain-error.ts.tpl', `domain/errors/${name.kebab}.error.ts`],
      ['domain-error/domain-error.spec.ts.tpl', `test/unit/${name.kebab}.error.spec.ts`],
    ]);
  },
});

/** Under `named` and `factories`, a refusal is built by a static factory: `generate error` writes it. */
function refuseBuiltThroughFactories(form: Config['stack']['refusals'], context: string): void {
  if (form === 'named') {
    throw new CliError(
      'This project names each refusal and builds it through static factories ("stack.refusals": "named").',
      `Write the refusal class, its code and its factory: \`ddd-ts-kit generate error ${context} <Refusal> <factory>\`.`,
    );
  }

  if (form === 'factories') {
    throw new CliError(
      'This project builds its domain errors through static factories ("stack.refusals": "factories").',
      `Add the refusal to the error class of its concept: \`ddd-ts-kit generate error ${context} <Concept> <refusal>\`.`,
    );
  }
}
