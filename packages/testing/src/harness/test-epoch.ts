/**
 * The instant a test starts at unless it says another: the one `createTestBuses` freezes its clock
 * at, a session is opened at and the generated dates are computed from. A `Date` of its own at each
 * call, so that no test changes the instant of another.
 */
export function testEpoch(): Date {
  return new Date('2026-01-01T00:00:00.000Z');
}
