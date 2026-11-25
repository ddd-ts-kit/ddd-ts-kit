// A table of rules is asked in its order: the first refusal answers, with the id of its rule.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstRefusal } from '../rule-table.mjs';

const asked = [];

test('the first rule that refuses answers with its id, and the rules after it are not asked', () => {
  asked.length = 0;
  const rules = [
    recorded('lets-through', () => undefined),
    recorded('refuses', ({ file }) => `${file} is refused`),
    recorded('never-asked', () => 'refused too'),
  ];
  assert.deepEqual(firstRefusal(rules, { file: 'a.ts' }), { id: 'refuses', reason: 'a.ts is refused' });
  assert.deepEqual(asked, ['lets-through', 'refuses']);
});

test('a rule that does not apply to the subject is not asked, and a table that refuses nothing answers nothing', () => {
  asked.length = 0;
  const rules = [
    { ...recorded('skipped', () => 'refused'), applies: ({ deleted }) => !deleted },
    recorded('lets-through', () => undefined),
  ];
  assert.equal(firstRefusal(rules, { deleted: true }), undefined);
  assert.deepEqual(asked, ['lets-through']);
  assert.deepEqual(firstRefusal(rules, { deleted: false }), { id: 'skipped', reason: 'refused' });
});

// A rule that records, in `asked`, each time its reason is asked.
function recorded(id, reason) {
  return {
    id,
    reason: (subject) => {
      asked.push(id);
      return reason(subject);
    },
  };
}
