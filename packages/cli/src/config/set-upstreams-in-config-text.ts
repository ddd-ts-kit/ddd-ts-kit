import type { Upstream } from './config';
import { editConfigText } from './edit-config-text';
import { isRecord } from './values/is-record';

/** Sets the upstreams of a context the config text declares, leaving every other key of it as the user wrote it. */
export function setUpstreamsInConfigText(content: string, name: string, upstreams: readonly Upstream[]): string {
  return editConfigText(content, (raw) => {
    const contexts = raw['contexts'];
    const context = isRecord(contexts) ? contexts[name] : undefined;

    if (isRecord(context)) {
      context['upstreams'] = upstreams.map(({ context: upstream, relationship }) => ({
        context: upstream,
        relationship,
      }));
    }
  });
}
