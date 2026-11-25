import { REDACTED, type IsHiddenKey } from '@ddd-ts-kit/kernel';

/**
 * Hides, in fields the adapter owns, the value of every key that is hidden, whatever its case:
 * the paths of pino name each key at the top as it is written.
 */
export function withoutCredentialsAtTop<Fields extends object>(fields: Fields, isHidden: IsHiddenKey): Fields {
  for (const key of Object.keys(fields)) {
    if (isHidden(key)) {
      Object.assign(fields, { [key]: REDACTED });
    }
  }

  return fields;
}
