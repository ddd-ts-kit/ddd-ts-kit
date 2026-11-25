import { buildsThroughFactories } from '../errors/builds-through-factories';
import { codesSetIn } from '../errors/codes-set-in';
import { isErrorFile } from '../errors/is-error-file';
import { namesRefusals } from '../errors/names-refusals';
import type { Finding } from '../model/finding';
import type { Rule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { perFile } from '../support/per-file';

const WHY = 'the HTTP mapping, the OpenAPI document, the audit trail and the tests know a refusal by its code alone.';

const FACTORIES_FIX = `Give each refusal of a context its own code, or call the factory that already sets this one: ${WHY}`;

const NAMED_FIX = `Give each refusal class of the context its own value in <context>.codes.ts, or throw the refusal that already has this code from one of its factories: ${WHY}`;

export const errorsCodeUnique: Rule = {
  id: 'errors/code-unique',
  description:
    'Under "stack.refusals": "factories" or "named", a code is given to one refusal of a context: no two factories, no two error classes and no two entries of <context>.codes.ts, of the domain/errors/ of a context, set the same code.',
  severity: 'error',
  doc: {
    why: 'The code is the identity of a refusal for everything outside the domain: the HTTP mapper gives it a status, the OpenAPI document lists it, the audit trail and the span record it as the reason, a client branches on it and a test asserts it. Nothing downstream knows the class or the factory. Two refusals of one context under one code are therefore one refusal for every reader, whatever their messages say. The code is checked per context, since each context owns its language: the same code in two contexts is allowed, and the error mapper of the application gives it one status. Every form is read: the first argument of `refusal(..)` in a factory of a concept class, the `readonly code` field of a class per error, and under "stack.refusals": "named" the values of <context>.codes.ts, the code list of the context, where two keys under one value are reported. Judged under "stack.refusals": "factories" and "named": a project whose config does not say was written when an error was a class, and keeps working untouched.',
    bad: `// appointment.codes.ts
export const AppointmentCodes = {
  SlotTaken: 'BOOKING_REFUSED',
  OutsideAvailability: 'BOOKING_REFUSED',
} as const;`,
    good: `// appointment.codes.ts
export const AppointmentCodes = {
  SlotTaken: 'SLOT_TAKEN',
  OutsideAvailability: 'OUTSIDE_AVAILABILITY',
} as const;`,
  },
  scope: 'project',
  run(project) {
    if (!buildsThroughFactories(project)) {
      return [];
    }

    const fix = namesRefusals(project) ? NAMED_FIX : FACTORIES_FIX;
    // Remembers, across the error files of a context, where each code was first written.
    const firstUse = new Map<string, string>();

    return perFile(project, this.id, (file) => codesTaken(file, firstUse, fix));
  },
};

function codesTaken(file: SourceFile, firstUse: Map<string, string>, fix: string): Finding[] {
  const { location } = file;

  if (location.area !== 'context' || !isErrorFile(file)) {
    return [];
  }

  return codesSetIn(file).flatMap(({ code, line }) => {
    const key = `${location.context} ${code}`;
    const first = firstUse.get(key);

    if (first === undefined) {
      firstUse.set(key, `${file.path}:${line}`);
    }

    return first === undefined
      ? []
      : [{ line, message: `The code "${code}" is already set in ${first}, in the same context.`, fix }];
  });
}
