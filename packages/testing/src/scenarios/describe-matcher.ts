import { show } from './show';

type MatchedClass = abstract new (...args: never[]) => unknown;

/** A matcher as a failure lists it: a name as it is, a class by its name, properties on one line. */
export function describeMatcher(matcher: string | MatchedClass | { readonly [property: string]: unknown }): string {
  if (typeof matcher === 'string') {
    return matcher;
  }

  return typeof matcher === 'function' ? `instance of ${matcher.name}` : show(matcher);
}
