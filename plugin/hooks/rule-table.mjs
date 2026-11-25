// A rule of the guard is a row of a table: `{ id, applies?, reason }`. `id` names it, in the message
// and in a test; `applies`, when the row has one, says whether the rule is asked of the subject at
// all; `reason` reads the subject and gives the sentence of the refusal, or nothing. A table is asked
// in its order, and its first refusal answers: the order of the rules is data. The tables are those of
// the entry (guard.mjs) and of the shell (shell-rules.mjs); the rules on one place written, which
// several of them share, are in place-rules.mjs.

/** The first rule of `rules` that refuses `subject`, as `{ id, reason }`; none when every rule lets it through. */
export function firstRefusal(rules, subject) {
  for (const { id, applies, reason } of rules) {
    const refusal = applies === undefined || applies(subject) ? reason(subject) : undefined;
    if (refusal) {
      return { id, reason: refusal };
    }
  }
  return undefined;
}
