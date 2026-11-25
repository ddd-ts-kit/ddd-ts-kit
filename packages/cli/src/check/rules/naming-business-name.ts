import { genericWordsOf } from '../business-names/generic-words-of';
import { judgesNames } from '../business-names/judges-names';
import type { NamedBinding } from '../business-names/named-binding';
import { namedBindings } from '../business-names/named-bindings';
import { suggestedName } from '../business-names/suggested-name';
import type { Finding } from '../model/finding';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';

const WHY =
  'the code of the model speaks the ubiquitous language of its context, and a generic word hides which concept the value is';

export const namingBusinessName: FileRule = {
  id: 'naming/business-name',
  description:
    'A variable, parameter, property, destructured or loop binding of domain/ and application/ (and of the shared kernel) is named after the concept it holds, never a generic word such as target, data or item.',
  severity: 'error',
  doc: {
    why: 'The code of the model is read by people who speak the business, and it is the ubiquitous language written down: a handler that loads an appointment and calls it target, data or item makes every reader translate it back, and hides which concept a line handles. A generic name also spreads, because the next line copies it: the command handler templates of the kit wrote target until 0.17, and forty handlers of the example inherited it. Judged: a variable, a loop variable, a destructured binding, a parameter (of a function, a method, a signature or an arrow) and a property (of a class, an interface or a type of an object) under domain/ and application/ of a context, and in the shared kernel outside presentation/, named target, targets, data, item, items, obj, object, thing, things, stuff, info, element, el, tmp, temp, foo, bar or baz; "businessNames": { "words": [..] } replaces the list and { "allow": [..] } removes words from it. A key of an object literal follows the type it is written for and is not judged, nor infrastructure, presentation, the platform and the tests. npx eslint --fix renames a variable built by X.create(..) or new X(..), or read from a repository, with every use of it; a loop variable is reported with the singular of its collection.',
    bad: `const target = await this.appointmentRepository.findById(command.appointmentId);
for (const target of due) {
  target.expire(now);
}`,
    good: `const appointment = await this.appointmentRepository.findById(command.appointmentId);
for (const reminder of dueReminders) {
  reminder.send(now);
}`,
  },
  scope: 'file',
  judge(file, project) {
    const words = genericWordsOf(project.config);

    if (words.size === 0 || !judgesNames(file, project.config.sharedKernelDir)) {
      return [];
    }

    return namedBindings(file.scan.code)
      .filter((binding) => words.has(binding.name))
      .map((binding) => finding(file, binding));
  },
};

function finding(file: SourceFile, binding: NamedBinding): Finding {
  const suggestion = suggestedName(binding);

  return {
    line: file.scan.lineAt(binding.offset),
    message: `The ${binding.kind} "${binding.name}" is named with a generic word.`,
    fix: `${rename(binding, suggestion)}: ${WHY}. \`npx eslint --fix\` renames a variable built by X.create(..) or new X(..), or read from a repository, with every use of it.`,
  };
}

function rename(binding: NamedBinding, suggestion: string | undefined): string {
  if (suggestion !== undefined) {
    return `Rename it ${suggestion}, the name the code already gives to what it holds`;
  }

  const collection = binding.source ?? '';

  if (binding.kind === 'loop variable') {
    return `Rename it after one element of ${collection === '' ? 'the collection' : collection}, in the singular (for (const reminder of dueReminders))`;
  }

  return 'Rename it after the concept it holds, a term of the glossary of the context (CONTEXT.md)';
}
