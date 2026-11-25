import { describe, expect, it } from 'vitest';
import { addFactory } from '../src/generate/errors/add-factory';
import { refusalClassName } from '../src/generate/errors/refusal-class-name';
import { withImport } from '../src/generate/with-import';
import { withPreviewFeature } from '../src/prisma-schema';
import { renderTemplate } from '../src/templating';

const factory = { className: 'InvoiceRefusal', name: 'forPaid', text: '  static forPaid() {}' };

describe('what a generator cannot read in a source', () => {
  it('is no class to add a factory to: a class that opens no body, or whose heritage never closes', () => {
    expect(addFactory('declare class InvoiceRefusal;\n', factory)).toBeUndefined();
    expect(addFactory('export class InvoiceRefusal extends Refusal<{ invoiceId: string\n', factory)).toBeUndefined();
    expect(addFactory('export class InvoiceRefusal extends refusalOf({ code\n', factory)).toBeUndefined();
  });

  it('is no import to add when the kit hands the writer a line that is none', () => {
    expect(() => withImport("import { A } from '@/a';\n", 'const b = 1;')).toThrow(
      'Not an import statement: const b = 1;',
    );
  });

  it('is a Prisma schema left as it is when it has no generator of the client', () => {
    const schema = 'datasource db {\n  provider = "postgresql"\n}\n';

    expect(withPreviewFeature(schema, 'partialIndexes')).toBe(schema);
  });
});

describe('a refusal class named after its role once the suffix is read', () => {
  it('is told that an error is built, not what is refused', () => {
    expect(() => refusalClassName('RefusalError')).toThrow('"RefusalError" says that an error is built');
    expect(() => refusalClassName('failure-error')).toThrow('says that an error is built');
  });
});

describe('a template that names a command of npm', () => {
  it('is refused when its variables name no package manager, and rendered in the dialect of the one they name', () => {
    const integration = { strategy: 'the outbox' };

    expect(() => renderTemplate('docs/integration-readme.md.tpl', { integration })).toThrow(
      'templates/docs/integration-readme.md.tpl: the template names a command of npm, and its variables name no package manager ("pm").',
    );

    expect(renderTemplate('docs/integration-readme.md.tpl', { integration, pm: { name: 'pnpm' } })).not.toMatch(
      /(?<![\w@/.-])np[mx] /,
    );
  });
});
