/** A matcher by properties names at least one: `{}` would match anything, and so assert nothing. */
export function namingAProperty<Matcher extends object>(matcher: Matcher, matched: string, instead: string): Matcher {
  if (Object.keys(matcher).length === 0) {
    throw new TypeError(
      `${matched === 'event' ? 'An' : 'A'} ${matched} matcher names at least one property: {} would match any ${matched}. Give ${instead} of the ${matched} to expect it whatever it carries.`,
    );
  }

  return matcher;
}
