/** The instant of a session nothing issued. A date of its own each time: a `Date` can be changed by who holds it. */
export function neverIssued(): Date {
  return new Date(0);
}
