import { CONFIG_FILE, type Config } from '../../config';
import type { ProjectRule } from '../model/rule';
import { cyclesIn } from '../support/cycles-in';
import { lineOf } from '../support/line-of';
import { reporter } from '../support/reporter';
import { ownEntry } from '../../config/values/own-entry';

const FIX =
  'Decide which context is upstream and remove the opposite upstream entry; the downstream reacts to integration events instead of being imported.';

export const contextNoCycle: ProjectRule = {
  id: 'context/no-cycle',
  description: 'The declared relationships between contexts form no cycle.',
  severity: 'error',
  doc: {
    why: 'Two contexts that are upstream of each other are one context with a line drawn through it: neither can be changed, deployed or understood alone. One of them has to be the supplier.',
    bad: `"billing": { "upstreams": [{ "context": "shipping" }] },
"shipping": { "upstreams": [{ "context": "billing" }] }`,
    good: `"billing": { "upstreams": [] },
"shipping": { "upstreams": [{ "context": "billing" }] }`,
  },
  scope: 'project',
  judge(project) {
    const report = reporter(project, this.id);

    return cyclesOf(project.config.contexts).map((cycle) => {
      const [first = ''] = cycle;

      return report(
        { file: CONFIG_FILE, line: lineOf(project.configText, `"${first}"`) },
        `Contexts depend on each other in a cycle: ${[...cycle, first].join(' -> ')}.`,
        FIX,
      );
    });
  },
};

/** Each cycle of the declared upstreams, once, as the contexts met from its first one. */
function cyclesOf(contexts: Config['contexts']): string[][] {
  return cyclesIn(Object.keys(contexts), (name) =>
    (ownEntry(contexts, name)?.upstreams ?? []).map((upstream) => upstream.context),
  );
}
