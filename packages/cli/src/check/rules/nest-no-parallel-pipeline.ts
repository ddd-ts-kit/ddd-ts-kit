import type { Finding } from '../model/finding';
import type { Layer } from '../model/layer';
import type { Project } from '../model/project';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { nestEquivalentsOf } from '../nest/nest-equivalents-of';

/** `domain/`, `application/` and the published language refuse every framework already (`layer/*`, `context/*`). */
const JUDGED: readonly Layer[] = ['presentation', 'infrastructure', 'module', 'root'];
const NEST_COMMON = '@nestjs/common';
const NEST_BRIDGE = '@ddd-ts-kit/http/nest';
/** What a controller sends a use case through. */
const BUSES = ['CommandBus', 'QueryBus'];

const ROUTED_BY_NEST_FIX =
  'Make it a route of the kit: `@KitRoute` of `@ddd-ts-kit/http/nest` on each method, served by `createControllersModule`, with its guards, its refusals and its place in the contract. A controller of Nest stays for what reaches no use case (health, metrics).';

export const nestNoParallelPipeline: FileRule = {
  id: 'nest/no-parallel-pipeline',
  description:
    "A context uses none of the tools of Nest that the kit does its own way (guards, pipes, exception filters, interceptors, its logger, Swagger, CQRS, its scheduler, a controller Nest serves): they would bypass the security, the errors and the contract of the kit. A Nest controller the kit serves (`@KitRoute`) declares its routes with Nest's decorators. Outside the contexts, a controller Nest serves reaches no use case. Nest stays in the platform for the rest.",
  severity: 'error',
  doc: {
    why: 'The routes of the kit are mounted under Nest, not through its pipeline: a guard, a pipe, an exception filter or an interceptor of Nest never sees them, and a controller of Nest written in a context is a route the kit does not see either. Its security is declared nowhere, its refusals are not problem documents with the codes the clients read, and it is missing from the contract. A right checked by a Nest guard is checked on HTTP only, never on /rpc, /trpc, a job or an event handler, which the permission of the use case covers. A Nest controller the kit serves is the exception: with `@KitRoute` of `@ddd-ts-kit/http/nest` on its methods, its routes are declared with the decorators of Nest (`@Controller`, `@Post`, `@Body`, `@Param`...) and served by the pipeline of the kit, and the raw request, the guards, pipes, filters and interceptors of Nest stay refused there. Outside the contexts, a controller Nest serves that reaches a use case (it names `CommandBus` or `QueryBus`, or imports a file of a context) is refused too: moving it to the platform would keep the hole. Each tool of Nest has its place in the kit: the message says which. Nest stays in the platform, for what is not a use case (health, WebSocket gateways, GraphQL), and its WebSocket, GraphQL, microservice and testing packages are not judged. Judged: presentation/, infrastructure/ and the module file of a context, outside its tests; domain/ and application/ already refuse every framework.',
    bad: `// presentation/http/issue-invoice.controller.ts
import { Controller, Post, UseGuards } from '@nestjs/common';
// infrastructure/external/payment-settings.ts
import { ConfigService } from '@nestjs/config';`,
    good: `// presentation/http/invoices.controller.ts
import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentActor, KitRoute, KitRoutes } from '@ddd-ts-kit/http/nest';

@Controller('invoices')
@KitRoutes({ guards: [Authenticated] })
export class InvoicesController {
  @Post(':invoiceId/issue')
  @KitRoute({ operationId: 'issueInvoice', summary: 'Issue an invoice', errors: ['INVOICE_ALREADY_ISSUED'] })
  issue(@Param('invoiceId') invoiceId: string, @Body() body: IssueInvoiceBody, @CurrentActor() actor: Actor) {}
}`,
  },
  scope: 'file',
  judge(file, project) {
    if (file.isTest) {
      return [];
    }

    if (file.location.area === 'context') {
      return JUDGED.includes(file.location.layer) ? nestToolsIn(file) : [];
    }

    return isUnderSources(file, project) ? routedByNest(file) : [];
  },
};

/** In a context: each import of a tool of Nest whose work the kit does. */
function nestToolsIn(file: SourceFile): Finding[] {
  const servedByKit = servesThroughTheKit(file);

  return file.imports.flatMap(({ line, specifier, names, target }) => {
    const equivalents = target.kind === 'package' ? nestEquivalentsOf(target.name, names, servedByKit) : [];

    if (equivalents.length === 0) {
      return [];
    }

    return [
      {
        line,
        message: `"${specifier}" brings ${equivalents.map(({ tool }) => tool).join(' and ')} of Nest into a context, where the pipeline of the kit does not see it.`,
        fix: `Use ${equivalents.map(({ instead }) => instead).join('; and ')}.`,
      },
    ];
  });
}

/**
 * Outside the contexts: a controller Nest serves that reaches a use case, through a bus or a file of
 * a context, is a route with none of the guarantees of the kit, wherever it is written.
 */
function routedByNest(file: SourceFile): Finding[] {
  const controller = file.imports.find(
    ({ target, names }) => target.kind === 'package' && target.name === NEST_COMMON && names.includes('Controller'),
  );

  if (controller === undefined || servesThroughTheKit(file) || !reachesUseCase(file)) {
    return [];
  }

  return [
    {
      line: controller.line,
      message:
        'A controller Nest serves reaches a use case: its routes have no declared security, no problem codes and no place in the contract.',
      fix: ROUTED_BY_NEST_FIX,
    },
  ];
}

function servesThroughTheKit(file: SourceFile): boolean {
  return file.imports.some(
    ({ specifier, names }) => specifier === NEST_BRIDGE && (names.includes('KitRoute') || names.includes('KitRoutes')),
  );
}

function reachesUseCase(file: SourceFile): boolean {
  return file.imports.some(
    ({ target, names }) =>
      (target.kind === 'file' && target.location.area === 'context') ||
      (target.kind === 'package' && names.some((name) => BUSES.includes(name))),
  );
}

function isUnderSources({ path }: SourceFile, { config }: Project): boolean {
  return path.startsWith(`${config.sourceRoot}/`);
}
