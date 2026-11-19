import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sbomOf } from './sbom.mjs';

const NOW = new Date('2026-11-18T12:00:00Z');
const KERNEL = 'pkg:npm/%40ddd-ts-kit/kernel@1.0.0';
const HTTP = 'pkg:npm/%40ddd-ts-kit/http@1.0.0';

test('a published package lists what it brings, found as Node finds it, and a workspace it depends on', () => {
  const { components, dependencies } = sbomOf(lock(), ['packages/http', 'packages/kernel'], '1.0.0', NOW);

  assert.deepEqual(
    components.map(({ name, version }) => `${name}@${version}`),
    ['@ddd-ts-kit/http@1.0.0', '@ddd-ts-kit/kernel@1.0.0', 'router@2.0.0', 'router@3.0.0', 'shared@1.0.0'],
  );
  assert.deepEqual(dependencies.find(({ ref }) => ref === HTTP)?.dependsOn, [KERNEL, 'pkg:npm/router@3.0.0']);
  assert.deepEqual(dependencies.find(({ ref }) => ref === KERNEL)?.dependsOn, [
    'pkg:npm/router@2.0.0',
    'pkg:npm/shared@1.0.0',
  ]);
  assert.deepEqual(dependencies.find(({ ref }) => ref === 'pkg:npm/router@3.0.0')?.dependsOn, ['pkg:npm/shared@1.0.0']);
});

test('a dependency of development, a peer and an optional dependency left uninstalled are not listed', () => {
  const { components } = sbomOf(lock(), ['packages/http', 'packages/kernel'], '1.0.0', NOW);
  const names = components.map(({ name }) => name);

  assert.ok(!names.includes('vitest'));
  assert.ok(!names.includes('zod'));
  assert.ok(!names.includes('fsevents'));
});

test('each component carries its purl, its license and its SHA-512 in hexadecimal', () => {
  const { components } = sbomOf(lock(), ['packages/kernel'], '1.0.0', NOW);
  const shared = components.find(({ name }) => name === 'shared');

  assert.deepEqual(shared, {
    type: 'library',
    'bom-ref': 'pkg:npm/shared@1.0.0',
    name: 'shared',
    version: '1.0.0',
    purl: 'pkg:npm/shared@1.0.0',
    licenses: [{ expression: 'MIT' }],
    hashes: [{ alg: 'SHA-512', content: Buffer.from('shared').toString('hex') }],
  });
  assert.equal(components.find(({ name }) => name === '@ddd-ts-kit/kernel')?.hashes, undefined);
});

test('the file carries the three fields the attestation reads to recognise CycloneDX', () => {
  const { bomFormat, specVersion, serialNumber } = sbomOf(lock(), ['packages/kernel'], '1.0.0', NOW);
  const another = sbomOf(lock(), ['packages/kernel'], '1.0.0', NOW);

  assert.equal(bomFormat, 'CycloneDX');
  assert.equal(specVersion, '1.6');
  assert.match(serialNumber, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(another.serialNumber, serialNumber);
  assert.equal(
    sbomOf(lock(), ['packages/kernel'], '1.0.0', NOW, '3e671687-395b-41f5-a30f-a58921a69b79').serialNumber,
    'urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79',
  );
});

test('the release is the root of the graph, at its version and time', () => {
  const { bomFormat, specVersion, metadata, dependencies } = sbomOf(lock(), ['packages/kernel'], '1.0.0', NOW);

  assert.equal(bomFormat, 'CycloneDX');
  assert.equal(specVersion, '1.6');
  assert.equal(metadata.timestamp, '2026-11-18T12:00:00.000Z');
  assert.deepEqual(metadata.component, {
    type: 'library',
    'bom-ref': 'pkg:npm/ddd-ts-kit-release@1.0.0',
    name: 'ddd-ts-kit',
    version: '1.0.0',
  });
  assert.deepEqual(dependencies.find(({ ref }) => ref === 'pkg:npm/ddd-ts-kit-release@1.0.0')?.dependsOn, [KERNEL]);
});

test('a workspace at another version than the release refuses the document', () => {
  assert.throws(
    () => sbomOf(lock(), ['packages/kernel'], '2.0.0', NOW),
    /packages\/kernel states 1\.0\.0 in package-lock\.json, not 2\.0\.0/,
  );
  assert.throws(() => sbomOf({}, ['packages/kernel'], '1.0.0', NOW), /states no version/);
});

/**
 * Two workspaces: http depends on kernel through its link, on router 3 nested under it while the
 * root holds router 2, and on shared through router; kernel brings router 2, shared and an
 * optional dependency the lockfile did not install.
 */
function lock() {
  return {
    lockfileVersion: 3,
    packages: {
      '': { name: 'workspace', devDependencies: { vitest: '^5.0.0' } },
      'packages/http': {
        name: '@ddd-ts-kit/http',
        version: '1.0.0',
        license: 'MIT',
        dependencies: { '@ddd-ts-kit/kernel': '1.0.0', router: '^3.0.0' },
        peerDependencies: { zod: '^4.0.0' },
        devDependencies: { vitest: '^5.0.0' },
      },
      'packages/http/node_modules/router': {
        version: '3.0.0',
        license: 'MIT',
        integrity: sha512('router3'),
        dependencies: { shared: '^1.0.0' },
      },
      'packages/kernel': {
        name: '@ddd-ts-kit/kernel',
        version: '1.0.0',
        license: 'MIT',
        dependencies: { router: '^2.0.0', shared: '^1.0.0' },
        optionalDependencies: { fsevents: '^2.0.0' },
      },
      'node_modules/@ddd-ts-kit/http': { resolved: 'packages/http', link: true },
      'node_modules/@ddd-ts-kit/kernel': { resolved: 'packages/kernel', link: true },
      'node_modules/router': { version: '2.0.0', license: 'MIT', integrity: sha512('router2') },
      'node_modules/shared': { version: '1.0.0', license: 'MIT', integrity: sha512('shared') },
      'node_modules/vitest': { version: '5.0.0', dev: true, license: 'MIT', integrity: sha512('vitest') },
      'node_modules/zod': { version: '4.0.0', dev: true, license: 'MIT', integrity: sha512('zod') },
    },
  };
}

function sha512(text) {
  return `sha512-${Buffer.from(text).toString('base64')}`;
}
