@@imports
import { undecided } from '@ddd-ts-kit/kernel';
import { {{name.pascal}}Contract } from '{{alias.contexts}}/{{upstream.kebab}}/published-language{{alias.index}}';
@@bindings
// TODO(platform): bind the implementation {{upstream.kebab}} gives of {{name.pascal}}Contract in place of this refusal.
builder.bind({{name.pascal}}Contract).toFactory(() => {
  throw undecided('what {{upstream.kebab}} answers as {{name.pascal}}Contract');
});
