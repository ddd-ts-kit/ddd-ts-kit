import { CREDENTIAL_KEYS, REDACTED, hiddenKeys, type IsHiddenKey } from '@ddd-ts-kit/kernel';
import winston from 'winston';

/**
 * A winston format hiding the value of `CREDENTIAL_KEYS` and of the given keys at the top of a
 * line and one level below. Names are matched without case, as `hiddenKeys` of the kernel
 * matches them. Place it after the formats that add fields.
 */
export function redactCredentials(keys: readonly string[] = CREDENTIAL_KEYS): winston.Logform.Format {
  const isHidden = hiddenKeys(keys);

  return winston.format((info) => {
    for (const [key, value] of Object.entries(info)) {
      if (isHidden(key)) {
        info[key] = REDACTED;
      } else if (isRecord(value)) {
        info[key] = withoutCredentials(value, isHidden);
      }
    }

    return info;
  })();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/** A nested object belongs to the caller: it is copied when a key has to be hidden, never written to. */
function withoutCredentials(
  nested: Readonly<Record<string, unknown>>,
  isHidden: IsHiddenKey,
): Readonly<Record<string, unknown>> {
  const credentials = Object.keys(nested).filter(isHidden);

  if (credentials.length === 0) {
    return nested;
  }

  return { ...nested, ...Object.fromEntries(credentials.map((key) => [key, REDACTED])) };
}
