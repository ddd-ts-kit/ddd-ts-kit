import { definePolicy } from '@ddd-ts-kit/auth';
import { {{context.camel}}Permissions } from '{{alias.context}}/{{context.kebab}}.permissions{{alias.ext}}';

// TODO(domain): a policy refuses everybody until its rule is written. Replace `unknown` by the aggregate "{{name.words}}" reads, add `appliesTo: (subject): subject is <Aggregate> => subject instanceof <Aggregate>`, and decide from the actor, the loaded element and `now`; the handler asks it through `Access.authorize(command.actor, permission, <aggregate>)`, the loaded aggregate named after its concept (`invoice`, never `element`).
export const {{name.camel}} = definePolicy<unknown>({
  name: '{{name.kebab}}',
  permission: {{context.camel}}Permissions['{{access.permission}}'],
  allows: () => false,
});
