import type { ProjectRule } from '../model/rule';
import { JUDGED_ONLY_WHEN_ON } from '../privacy/judged-only-when-on';
import { personalTermOf } from '../privacy/personal-term-of';
import { privacyJudged } from '../privacy/privacy-judged';
import { type PublishedEventOf, publishedEventsOf } from '../privacy/published-events-of';
import { sameName } from '../privacy/same-name';
import { vocabularyOf } from '../privacy/vocabulary-of';
import { reporter } from '../support/reporter';

/**
 * A field of the payload of an integration event whose name says it holds personal data is
 * listed in the `personal` option of its declaration, `personal: { subject, fields }`: the event
 * catalog, the AsyncAPI document and the register say it then, and a context that copies it knows
 * it keeps a copy to erase. Read from the `z.object({...})` of the declaration and from the class or
 * the interface of its `.payload.ts`. Silent with `stack.privacy` off.
 */
export const privacyEventPayloadDeclared: ProjectRule = {
  id: 'privacy/event-payload-declared',
  description:
    'A field of the payload of an integration event named like personal data is listed in the personal option of its declaration.',
  severity: 'warn',
  doc: {
    why: `An integration event that carries personal data hands a copy of the person to every consumer. Its personal option says so: the event catalog prints it, AsyncAPI marks it (x-personal-data), the register lists the event and the contexts downstream, and privacy/erasure-reaches-copies asks those that consume it to erase their copy. A field of the payload whose name holds a word of the vocabulary and that the option does not list is a copy nobody knows of. Judged on the keys of the z.object of the declaration (the objects nested in it included) and on the members of the class or the interface of its .payload.ts; a path of the option is compared by its last name (customer.email lists email). The subject is the field that names the person, an opaque id. Minimisation first: a field no consumer needs leaves the payload. ${JUDGED_ONLY_WHEN_ON}`,
    bad: `export const customerRegisteredV1 = defineIntegrationEvent({
  type: 'crm.customer.registered',
  version: 1,
  payload: zodSchema(z.object({ customerId: z.string(), email: z.string() })),
});`,
    good: `export const customerRegisteredV1 = defineIntegrationEvent({
  type: 'crm.customer.registered',
  version: 1,
  personal: { subject: 'customerId', fields: ['email'] },
  payload: zodSchema(z.object({ customerId: z.string(), email: z.string() })),
});`,
  },
  scope: 'project',
  judge(project) {
    if (!privacyJudged(project)) {
      return [];
    }

    const vocabulary = vocabularyOf(project.config);
    const report = reporter(project, this.id);

    return publishedEventsOf(project).flatMap((event) =>
      event.payload.flatMap((field) => {
        const term = personalTermOf(field.name, vocabulary);

        return term === undefined || listed(event, field.name)
          ? []
          : [
              report(
                field,
                `The field ${field.name} of the payload of ${event.type} is named like personal data (${term}), and the personal option of the event does not list it: its consumers do not know they receive a copy of a person.`,
                `List it in the declaration of the event, \`personal: { subject: '<the field that names the person>', fields: ['${field.name}'] }\` in ${event.file}, or leave it out of the payload when no consumer needs it (data minimisation). A field that holds nothing of a person is recorded: \`// ddd-ts-kit-disable-next-line privacy/event-payload-declared -- ADR-NNNN: <why>\`.`,
              ),
            ];
      }),
    );
  },
};

/** The field is the subject, or one of the fields, a path compared by its last name. */
function listed(event: PublishedEventOf, name: string): boolean {
  const declared = event.personal === undefined ? [] : [event.personal.subject, ...event.personal.fields];

  return declared.some((path) => sameName(path.split('.').at(-1)?.replace('[]', '') ?? path, name));
}
