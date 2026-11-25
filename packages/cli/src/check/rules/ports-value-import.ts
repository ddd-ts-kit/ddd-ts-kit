import { bindingCalls } from '../declarations/binding-calls';
import { dependencyLists } from '../declarations/dependency-lists';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

interface Named {
  readonly name: string;
  readonly line: number;
  readonly where: string;
}

export const portsValueImport: FileRule = {
  id: 'ports/value-import',
  description:
    'A class named in a dependency list or bound with bind or rebind is imported as a value, never with `import type`: the class is the token.',
  severity: 'error',
  doc: {
    why: 'A port named in a dependency list or given to bind is used as a value: the class itself is looked up in the container. `import type` erases the import when the file is compiled, so the list would hold undefined at run time, or the file would not compile. The import of a token is a plain import; `import type` stays right for a class that only types a parameter.',
    bad: `import type { InvoiceRepository } from '@/contexts/billing/domain/repositories/invoice.repository';
import { type Clock } from '@ddd-ts-kit/kernel';

// billing.module.ts, explicit style
builder.command(IssueInvoiceCommand).handledBy(IssueInvoiceHandler, [InvoiceRepository, Clock]);`,
    good: `import { Clock } from '@ddd-ts-kit/kernel';
import { InvoiceRepository } from '@/contexts/billing/domain/repositories/invoice.repository';

// billing.module.ts, explicit style
builder.command(IssueInvoiceCommand).handledBy(IssueInvoiceHandler, [InvoiceRepository, Clock]);`,
  },
  scope: 'file',
  judge(file) {
    const typeOnly = new Set(file.imports.flatMap(({ typeNames }) => typeNames));

    return tokensOf(file)
      .filter(({ name }) => typeOnly.has(name))
      .map(({ name, line, where }) => ({
        line,
        message: `${name} is imported as a type and named in ${where}: at run time the token would be undefined.`,
        fix: `Import it as a value, \`import { ${name} } from '...'\`, without \`type\`: the abstract class is the injection token, so it has to exist when the file runs.`,
      }));
  },
};

/** The names a file uses as injection tokens: in its dependency lists and as the first argument of `bind` and `rebind`. */
function tokensOf(file: SourceFile): Named[] {
  const listed = dependencyLists(file).flatMap(({ owner, names }) =>
    names.map(({ name, line }) => ({ name, line, where: `the dependency list of ${owner}` })),
  );

  const bound = bindingCalls(file)
    .filter(({ method, token }) => (method === 'bind' || method === 'rebind') && IDENTIFIER.test(token?.code ?? ''))
    .map(({ method, token, line }) => ({ name: token?.code ?? '', line, where: `${method}(...)` }));

  return [...listed, ...bound];
}
