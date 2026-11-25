import path from 'node:path';
import { bindingCalls } from '../declarations/binding-calls';
import { dependencyLists } from '../declarations/dependency-lists';
import type { Finding } from '../model/finding';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { escapeRegExp } from '../text/escape-reg-exp';

const UPPER_SNAKE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const TOKEN_CALL = /(?<![\w$.])token\s*(?:<[^<>()]*(?:<[^<>()]*>[^<>()]*)*>)?\s*\(/g;
const SYMBOL = /^Symbol\s*(?:\.\s*for\s*)?\(/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const PORT_FIX =
  'Declare the port as an abstract class (domain/repositories/*.repository.ts or application/ports/*.port.ts) and name that class: the class is the contract and the injection token at once, and the compiler checks the list against the constructor.';

export const portsNoTokenConstant: FileRule = {
  id: 'ports/no-token-constant',
  description:
    'No injection token beside the port: no token(), no Symbol or string token, no UPPER_SNAKE_CASE name in a dependency list, no *.ports.ts nor tokens.ts file.',
  severity: 'error',
  doc: {
    why: 'The abstract class of a port is its injection token: it names the dependency, carries its type and lets the compiler check a dependency list against a constructor. A constant beside it (a token() call, a Symbol, a string, an UPPER_SNAKE_CASE name in a list) is a second name for the same thing that nothing ties to the type, and a file of tokens is one more place to keep in step with the ports. There is one way to name a dependency: the class.',
    bad: `// application/ports/billing.ports.ts
export const INVOICE_REPOSITORY = token<InvoiceRepository>('billing.InvoiceRepository');
// billing.module.ts, explicit style
builder.command(IssueInvoiceCommand).handledBy(IssueInvoiceHandler, [INVOICE_REPOSITORY, CLOCK]);
builder.bind(Symbol.for('billing.PaymentGateway')).toClass(StripePaymentGateway, []);`,
    good: `// domain/repositories/invoice.repository.ts
export abstract class InvoiceRepository extends Repository<Invoice> {}
// application/commands/issue-invoice/issue-invoice.handler.ts
@CommandHandler(IssueInvoiceCommand)
constructor(private readonly invoices: InvoiceRepository, private readonly clock: Clock) {}
// billing.module.ts, explicit style
builder.bind(PaymentGateway).toClass(StripePaymentGateway, [PaymentSettings]);`,
  },
  scope: 'file',
  judge(file) {
    return file.isTest
      ? []
      : [...tokenFile(file), ...tokenCalls(file), ...literalTokens(file), ...constantsInLists(file)];
  },
};

function tokenFile(file: SourceFile): Finding[] {
  const name = path.posix.basename(file.path);

  if (name !== 'tokens.ts' && !name.endsWith('.ports.ts')) {
    return [];
  }

  return [
    {
      line: 1,
      message: `"${name}" is a file of injection tokens.`,
      fix: `Delete it and give each port its own file holding one abstract class (application/ports/<name>.port.ts, domain/repositories/<name>.repository.ts): the class is the token.`,
    },
  ];
}

/** A call of a function named `token` imported from a package of the kit. */
function tokenCalls(file: SourceFile): Finding[] {
  const imported = file.imports.some(
    ({ target, names }) =>
      target.kind === 'package' && target.name.startsWith('@ddd-ts-kit/') && names.includes('token'),
  );

  if (!imported) {
    return [];
  }

  return [...file.scan.code.matchAll(TOKEN_CALL)].map((match) => ({
    line: file.scan.lineAt(match.index),
    message: 'token(...) declares an injection token beside the port.',
    fix: PORT_FIX,
  }));
}

/** A `Symbol(..)`, a `Symbol.for(..)` or a string given to a binding call, written in place or held by a local constant. */
function literalTokens(file: SourceFile): Finding[] {
  return bindingCalls(file).flatMap(({ method, token, line }) => {
    const code = token?.code ?? '';

    if (SYMBOL.test(code)) {
      return [{ line, message: `${method}(...) is given a symbol as its token.`, fix: PORT_FIX }];
    }

    if (/^['"`]/.test(code)) {
      return [{ line, message: `${method}(...) is given a string as its token.`, fix: PORT_FIX }];
    }

    const declared = IDENTIFIER.test(code)
      ? new RegExp(
          `(?<![\\w$.])(?:const|let|var)\\s+${escapeRegExp(code)}\\s*(?::[^=;]+)?=\\s*Symbol\\s*(?:\\.\\s*for\\s*)?\\(`,
        ).exec(file.scan.code)
      : null;

    return declared === null
      ? []
      : [
          {
            line: file.scan.lineAt(declared.index),
            message: `${code} is a symbol declared as an injection token and given to ${method}(...).`,
            fix: PORT_FIX,
          },
        ];
  });
}

function constantsInLists(file: SourceFile): Finding[] {
  return dependencyLists(file).flatMap(({ owner, names }) =>
    names
      .filter(({ name }) => name.length > 1 && UPPER_SNAKE.test(name))
      .map(({ name, line }) => ({
        line,
        message: `The dependency list of ${owner} names the constant ${name}: a list names ports, which are abstract classes.`,
        fix: PORT_FIX,
      })),
  );
}
