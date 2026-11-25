import { anonymousActor } from '../actor/anonymous-actor';
import { neverIssued } from './never-issued';
import type { Session } from './session';

const ANONYMOUS_SESSION: Session = Object.freeze({
  id: 'anonymous',
  actor: anonymousActor(),
  get issuedAt() {
    return neverIssued();
  },
  authenticationMethod: 'none',
  extensions: Object.freeze({}),
});

/** The session of a caller that presented no credential. It never expires. */
export function anonymousSession(): Session {
  return ANONYMOUS_SESSION;
}
