import type { Upstream } from './config';
import { editConfigText } from './edit-config-text';
import { isRecord } from './values/is-record';

/** Appends upstreams to a context the config text declares, leaving the ones it holds as the user wrote them. */
export function addUpstreamsToConfigText(content: string, name: string, added: readonly Upstream[]): string {
  return editConfigText(content, (raw) => {
    const contexts = raw['contexts'];
    const context = isRecord(contexts) ? contexts[name] : undefined;

    if (isRecord(context)) {
      const held: unknown[] = Array.isArray(context['upstreams']) ? context['upstreams'] : [];

      context['upstreams'] = [
        ...held,
        ...added.map(({ context: upstream, relationship }) => ({ context: upstream, relationship })),
      ];
    }
  });
}
