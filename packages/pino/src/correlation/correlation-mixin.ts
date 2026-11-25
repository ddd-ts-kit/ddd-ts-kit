import { hiddenKeys, type LogFields } from '@ddd-ts-kit/kernel';
import { withoutCredentialsAtTop } from '../redaction/without-credentials-at-top';

/**
 * A pino `mixin` reading the fields of the work in progress at each line that is written. A
 * source that throws (no active span, no execution context) gives no field, never a lost line.
 * `redact` names the keys hidden in addition to `CREDENTIAL_KEYS`, those `credentialRedaction`
 * was given: among these fields they are hidden whatever their case.
 */
export function correlationMixin(fields: () => LogFields, redact: readonly string[] = []): () => LogFields {
  const isHidden = hiddenKeys(redact);

  return () => {
    try {
      // A copy: pino merges the fields of the line into the object the mixin answers.
      return withoutCredentialsAtTop({ ...fields() }, isHidden);
    } catch {
      return {};
    }
  };
}
