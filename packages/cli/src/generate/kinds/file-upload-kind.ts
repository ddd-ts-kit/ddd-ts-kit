import { CONFIG_FILE } from '../../config';
import { CliError } from '../../cli-error';
import { accessVars } from '../access-vars';
import { concept } from '../concept';
import { emit } from '../emit';
import { TERM } from '../kind-options';
import { named } from '../named';
import type { Scope } from '../scope';
import { specVars } from '../spec-vars';
import { vars } from '../vars';
import { wire } from '../wire';
import { uploadFileVars } from './file-upload/upload-file-vars';
import { writeNestUploadController } from './file-upload/write-nest-upload-controller';
import { writeUploadController } from './file-upload/write-upload-controller';
import { findUseCase } from './route/find-use-case';
import { parseEndpoint } from './route/parse-endpoint';
import { planController } from './route/plan-controller';
import { NO_HTTP_STACK } from '../refuse-without-http';
import { GRANTED, GRANTS } from '../shared-write';
import { defineKind } from '../define-kind';

export const fileUploadKind = defineKind({
  name: 'file-upload',
  summary:
    'An upload: a controller that declares the file it receives (`@Upload()` of a Nest controller; size and media types in the contract, checked as it streams; with `--text` a text file such as a CSV, `single-byte` when it may be in Windows-1252 as well as UTF-8), the command that carries it as a FileUpload (staged by the command bus before the transaction), the handler that records it and promotes it with the commit, and their specs. Needs "stack.storage".',
  scope: 'context',
  positionals: ['UseCaseName'],
  options: {
    path: { type: 'string' },
    permission: { type: 'string', value: '<aggregate>.<action>' },
    grant: { type: 'string', value: '<role>' },
    public: { type: 'boolean' },
    method: { type: 'string', value: '<POST|PUT>' },
    group: { type: 'string', value: '<Name>' },
    text: { type: 'string', value: '<utf-8|single-byte>' },
    term: TERM,
  },
  shownOptions:
    '--path <path> (--permission <aggregate>.<action> [--grant <role>] | --public) [--method <POST|PUT>] [--group <Name>] [--text <utf-8|single-byte>] [--term "<Term>=<meaning>"]...',
  shared: { files: GRANTS, when: GRANTED, worker: 'without --grant' },
  writesInModules: true,
  run: (scope, request) => {
    assertFileStack(scope);

    const name = concept(scope, request.args[1] ?? '', {
      what: 'use case',
      strip: ['command', 'handler', 'controller', 'upload'],
    });

    const access = accessVars(scope, { name, kind: 'Command' });
    const upload = uploadFileVars(scope);
    const context = vars(scope, { name: named(name), access, spec: specVars(scope, access), upload });
    const folder = `application/commands/${name.kebab}`;

    emit(scope, context, [
      ['file-upload/command.ts.tpl', `${folder}/${name.kebab}.command.ts`],
      ['file-upload/handler.ts.tpl', `${folder}/${name.kebab}.handler.ts`],
      ['file-upload/handler.spec.ts.tpl', `test/unit/${name.kebab}.handler.spec.ts`],
    ]);

    wire(scope, 'file-upload', context);

    const endpoint = parseEndpoint({
      method: request.flags.text('method') ?? 'POST',
      path: request.flags.text('path'),
    });

    // The text fields of an upload are read by its own templates: the route does not read the message from them.
    const useCase = { ...findUseCase(scope, name, { command: true, query: false }), fields: [] };

    const plan = planController(
      scope,
      { name, endpoint, useCase },
      { mapper: false, serializer: false, cache: undefined },
    );

    if (scope.config.stack.routes === 'nest') {
      writeNestUploadController(scope, plan);
    } else {
      writeUploadController(scope, plan);
    }
  },
});

function assertFileStack(scope: Scope): void {
  const { storage, http } = scope.config.stack;

  if (storage !== 'none' && http !== 'none') {
    return;
  }

  throw new CliError(
    storage === 'none' ? 'This project keeps no files (stack.storage is "none").' : NO_HTTP_STACK,
    `Run \`ddd-ts-kit init --force --storage local\` (or s3) to wire the file storage, with an HTTP stack in ${CONFIG_FILE}; the content of files never goes in the database.`,
  );
}
