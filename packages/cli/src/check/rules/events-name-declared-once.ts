import type { Finding } from '../model/finding';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import type { StringRecord } from '../scan/string-record';
import type { ClassShape } from '../structure/class-shape';
import { inContext } from '../support/in-context';

/** `static readonly eventName = '...'`, typed or not, or `extends NamedDomainEvent('...')`. */
const STATIC_NAME =
  /(?<![\w$.])static\s+readonly\s+eventName\s*(?::[^=;\n'"]+)?=\s*$|(?<![\w$.])NamedDomainEvent\s*\(\s*$/;

/** `name = '...'`, `name: '...'`, `name: string = '...'`: the name written a second time. */
const NAME_LITERAL = /(?<![\w$.])name\s*\??\s*(?:[:=]|:[^=;\n'"]+=)\s*$/;

export const eventsNameDeclaredOnce: FileRule = {
  id: 'events/name-declared-once',
  description:
    'Every domain event class declares its name once, `static readonly eventName`, and its `readonly name` reads it.',
  severity: 'error',
  doc: {
    why: 'A domain event handler and a projection are attached under the name the event class declares, static readonly eventName: the compiler refuses a reaction to an event class without it. Checked on every domain event, a missing name is found when the event is written, not later when someone first reacts to it. A name written a second time, as a literal in readonly name, drifts from the one the reactions read: extend NamedDomainEvent and the instance name reads the static one.',
    bad: `export class InvoiceIssued implements DomainEvent {
  readonly name = 'billing.invoice.issued';
}`,
    good: `export class InvoiceIssued extends NamedDomainEvent('billing.invoice.issued') {
}`,
  },
  scope: 'file',
  judge(file) {
    if (!inContext(file.location) || file.isTest) {
      return [];
    }

    const { layer, inside, context } = file.location;

    if (layer !== 'domain' || inside[0] !== 'events') {
      return [];
    }

    return file.structure.classes
      .filter((declared) => declared.depth === 0 && !declared.isAbstract)
      .flatMap((declared) => judge(file, declared, context));
  },
};

function judge(file: SourceFile, declared: ClassShape, context: string): Finding[] {
  const declaredOnce = literalsAfter(file, declared, STATIC_NAME)[0];
  const written = literalsAfter(file, declared, NAME_LITERAL);

  if (declaredOnce === undefined) {
    const name = written[0]?.value ?? `${context}.<aggregate>.<fact>`;

    return [
      {
        line: written[0]?.line ?? declared.line,
        message: `The domain event ${declared.name} does not declare its name once: it declares no eventName.`,
        fix: `Write \`extends NamedDomainEvent('${name}')\` on ${declared.name}, or write \`static readonly eventName = '${name}';\` and \`readonly name = ${declared.name}.eventName;\`: handlers and projections are attached under that static name.`,
      },
    ];
  }

  return written.map(({ line, value }) => ({
    line,
    message: `The domain event ${declared.name} writes its name "${value}" a second time instead of reading its eventName.`,
    fix: `Extend NamedDomainEvent, or write \`readonly name = ${declared.name}.eventName;\`: the name is declared once, on the class.`,
  }));
}

function literalsAfter(file: SourceFile, declared: ClassShape, pattern: RegExp): StringRecord[] {
  const { code, strings } = file.scan;

  return strings.filter(
    (literal) =>
      literal.start > declared.start &&
      literal.start < declared.end &&
      pattern.test(code.slice(Math.max(0, literal.start - 200), literal.start)),
  );
}
