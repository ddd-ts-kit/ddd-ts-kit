import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verdictOf } from './audit.mjs';

const NOW = new Date('2026-11-17T12:00:00Z');
const URL = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';

test('an advisory of severity high fails the audit, once, whatever the packages it reaches through', () => {
  const { blocking, excused, stale } = verdictOf(report(advisory(URL)), [], NOW);

  assert.deepEqual(
    blocking.map(({ url }) => url),
    [URL],
  );
  assert.deepEqual(excused, []);
  assert.deepEqual(stale, []);
});

test('an exception in force excuses its advisory alone, up to the end of its last day', () => {
  const other = 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc';
  const { blocking, excused, stale } = verdictOf(
    report(advisory(URL), advisory(other, 'critical', 'other')),
    [exception('2026-11-17')],
    NOW,
  );

  assert.deepEqual(
    blocking.map(({ url }) => url),
    [other],
  );
  assert.deepEqual(
    excused.map(({ url, until }) => [url, until]),
    [[URL, '2026-11-17']],
  );
  assert.deepEqual(stale, []);
});

test('an expired exception excuses nothing and is reported', () => {
  const { blocking, stale } = verdictOf(report(advisory(URL)), [exception('2026-11-16')], NOW);

  assert.equal(blocking.length, 1);
  assert.match(stale[0] ?? '', /GHSA-fc5q-39xc-vjpf expired on 2026-11-16/);
});

test('an exception whose advisory is no longer reported is to be removed', () => {
  const { blocking, stale } = verdictOf({ vulnerabilities: {} }, [exception()], NOW);

  assert.deepEqual(blocking, []);
  assert.deepEqual(stale, ['GHSA-fc5q-39xc-vjpf is no longer reported: remove its exception']);
});

test('an advisory below high neither fails the audit nor keeps an exception alive', () => {
  const { blocking, stale } = verdictOf(report(advisory(URL, 'moderate')), [exception()], NOW);

  assert.deepEqual(blocking, []);
  assert.equal(stale.length, 1);
});

test('a report without vulnerabilities passes', () => {
  assert.deepEqual(verdictOf({}, [], NOW), { blocking: [], excused: [], stale: [] });
});

/** A report of npm audit: the package that holds each advisory, and one that holds them through another package. */
function report(...advisories) {
  return {
    vulnerabilities: {
      ...Object.fromEntries(advisories.map((held) => [held.name, { via: [held] }])),
      tinyglobby: { via: advisories.map(({ name }) => name) },
    },
  };
}

function advisory(url, severity = 'high', name = 'picomatch') {
  return { url, severity, name, title: `${name} is weak` };
}

function exception(until = '2026-12-17', id = 'GHSA-fc5q-39xc-vjpf') {
  return { advisory: id, until, reason: 'unreachable' };
}
