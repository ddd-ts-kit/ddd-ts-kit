/** The stable code a failure carries, when it carries one: what a refusal is known by. */
export function codeOf(failure: unknown): string | undefined {
  return typeof failure === 'object' && failure !== null && 'code' in failure && typeof failure.code === 'string'
    ? failure.code
    : undefined;
}
