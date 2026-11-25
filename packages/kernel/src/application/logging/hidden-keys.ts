import { isCredentialKey } from './is-credential-key';

/** Whether a field of that name is written as `REDACTED` instead of its value. */
export type IsHiddenKey = (name: string) => boolean;

/**
 * The one question a redacting logger asks of a field name, wherever the field comes from: is it
 * one of `CREDENTIAL_KEYS` or of the names a project adds to them, whatever its case.
 */
export function hiddenKeys(added: readonly string[] = []): IsHiddenKey {
  const names: ReadonlySet<string> = new Set(added.map((name) => name.toLowerCase()));

  return (name) => isCredentialKey(name) || names.has(name.toLowerCase());
}
