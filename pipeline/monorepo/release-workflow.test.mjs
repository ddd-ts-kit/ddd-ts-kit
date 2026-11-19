import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const WORKFLOW = fs.readFileSync(path.resolve(import.meta.dirname, '../../.github/workflows/release.yml'), 'utf8');

test('the job that installs and builds holds no publishing identity', () => {
  for (const job of jobs().filter((entry) => /run: npm (ci|install)\b/.test(entry.text))) {
    assert.doesNotMatch(
      job.text,
      /id-token:\s*write/,
      `${job.id} installs dependencies and asks for an identity token`,
    );
  }
});

test('the job that holds the publishing identity installs and builds nothing', () => {
  const holders = jobs().filter((entry) => /id-token:\s*write/.test(entry.text));

  assert.ok(holders.length > 0);

  for (const job of holders) {
    assert.doesNotMatch(job.text, /npm (ci|install|run build)\b/, `${job.id} installs or builds`);
    assert.match(job.text, /environment: npm/);
  }
});

test('the tarballs are attested, with their provenance and the bill of materials, before they are published', () => {
  const [publish] = jobs().filter((entry) => entry.id === 'publish');
  const steps = (publish?.text ?? '').split(/\n {6}- /);
  const attest = steps.filter((text) => /uses: actions\/attest@/.test(text));
  const provenance = attest.findIndex((text) => !/sbom-path:/.test(text) && !/predicate/.test(text));
  const bill = attest.findIndex((text) => /sbom-path: sbom\/ddd-ts-kit\.cdx\.json/.test(text));
  const published = steps.findIndex((text) => /publish-packages\.mjs/.test(text));

  assert.match(publish?.text ?? '', /attestations:\s*write/);
  assert.ok(provenance >= 0, 'the provenance of the tarballs is attested');
  assert.ok(bill >= 0, 'the bill of materials is attested');
  assert.ok(steps.indexOf(attest[provenance]) < published, 'attested before published');
  assert.ok(steps.indexOf(attest[bill]) < published, 'attested before published');
});

function jobs() {
  const [, body] = WORKFLOW.split(/^jobs:\n/m);

  return body
    .split(/^ {2}(?=[a-z][\w-]*:\n)/m)
    .filter((block) => /^[a-z][\w-]*:\n/.test(block))
    .map((block) => ({ id: block.split(':')[0], text: block }));
}
