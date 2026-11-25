import type { Finding } from '../model/finding';
import type { Rule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { inLayer } from '../support/in-layer';
import { perFile } from '../support/per-file';

/** What tells one caller from another by hand: a test on the roles, a comparison with a role, an `isAdmin`. */
const ROLE_TESTS: readonly { readonly pattern: RegExp; readonly what: string }[] = [
  {
    pattern: /(?<![\w$])roles\s*\.\s*(?:includes|some|every|find|indexOf)\s*\(/,
    what: 'A test on the roles of the actor',
  },
  { pattern: /(?<![\w$])role\s*[!=]==?|[!=]==?\s*(?:[\w$]+\s*\.\s*)*role(?![\w$(])/, what: 'A comparison on a role' },
  { pattern: /(?<![\w$])isAdmin(?![\w$])/, what: 'isAdmin' },
];

const FIX =
  'Answer every field the read model holds and mark the one reserved to some callers on the response schema: withFieldAccess(schema, { internalNote: { read: { permission } } }) of @ddd-ts-kit/http. The pipeline leaves it out for an actor who may not read it, in JSON, XML and CSV alike, the contract says so, and a form described by the server shows it read-only or not at all. Which rows the actor may read at all stays the access scope of the query.';

export const authzFieldsBySchema: Rule = {
  id: 'authz/fields-by-schema',
  description:
    'A query never shapes its answer by the roles of the actor: a field reserved to some callers is marked on the response schema (withFieldAccess of @ddd-ts-kit/http), not removed by hand under application/queries/.',
  severity: 'error',
  doc: {
    why: 'A query that removes a field for the callers without a role answers one way in JSON and is forgotten in the CSV export, the XML of a partner and the form of the front end, and nobody reading the contract knows the field may be missing. Marked on the response schema with withFieldAccess of @ddd-ts-kit/http, the field is reserved to a permission or a policy once: the pipeline leaves it out of every representation for an actor who may not read it, refuses it in a request body from one who may not set it, the contract says so with x-field-access, and a form described by the server shows it read-only or not at all. Which rows the actor may read stays the access scope of the query. Judged: a test on the roles (roles.includes, some, every, find, indexOf), a comparison with a role, or isAdmin, in a file under application/queries/ of a context.',
    bad: `// application/queries/get-appointment/get-appointment.handler.ts
const row = await this.appointments.findById(query.appointmentId);
return query.actor.roles.includes('practitioner') ? row : { ...row, internalNote: undefined };`,
    good: `// application/queries/get-appointment/get-appointment.handler.ts
return this.appointments.findById(query.appointmentId);
// presentation/http/appointments/get-appointment/get-appointment.controller.ts
const answer = withFieldAccess(classSchema(GetAppointmentAnswer), {
  internalNote: { read: { permission: schedulingPermissions['appointment.note.read'] } },
});`,
  },
  scope: 'file',
  run(project) {
    return perFile(project, this.id, roleShapedAnswer);
  },
};

function roleShapedAnswer(file: SourceFile): Finding[] {
  const location = inLayer(file, 'application');

  if (location?.inside[0] !== 'queries') {
    return [];
  }

  return ROLE_TESTS.flatMap(({ pattern, what }) => {
    const match = pattern.exec(file.scan.code);

    return match === null
      ? []
      : [{ line: file.scan.lineAt(match.index), message: `${what} shapes the answer of a query.`, fix: FIX }];
  });
}
