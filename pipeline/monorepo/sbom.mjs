// The software bill of materials of a release, in CycloneDX 1.6 JSON: each published package of the
// kit at the version of the release, and each package that installing them brings, at the version,
// license and integrity package-lock.json holds for it, with who depends on whom. What a package
// brings is its `dependencies` and the `optionalDependencies` the lockfile installed; a peer is the
// choice of the project that installs the kit, so it is not listed. Run by the release workflow:
// `node pipeline/monorepo/sbom.mjs <version> --output <file>`.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}

function main([version, flag, output]) {
  if (version === undefined || flag !== '--output' || output === undefined) {
    console.error('Usage: sbom.mjs <version> --output <file>');

    return 2;
  }

  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const sbom = sbomOf(lock, publishedWorkspaces(), version, new Date());

  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(path.resolve(output), `${JSON.stringify(sbom, null, 2)}\n`);
  console.log(`${sbom.components.length} components in ${output}`);

  return 0;
}

/** The directories of `packages/` whose package is published, relative to the root, as the lockfile names them. */
function publishedWorkspaces() {
  return fs
    .readdirSync(path.join(ROOT, 'packages'))
    .filter((directory) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', directory, 'package.json'), 'utf8'));

      return manifest.private !== true;
    })
    .map((directory) => `packages/${directory}`)
    .sort();
}

/**
 * The CycloneDX document of the given workspaces and of what they bring, read from a lockfile of
 * version 3. A workspace that does not state `version` refuses the document: the release names
 * one version for every package.
 */
export function sbomOf(lock, workspaces, version, now, serial = randomUUID()) {
  const entries = lock.packages ?? {};
  const components = new Map();
  const dependencies = new Map();
  const pending = [...workspaces];

  for (const workspace of workspaces) {
    const stated = entries[workspace]?.version;

    if (stated !== version) {
      throw new Error(`${workspace} states ${stated ?? 'no version'} in package-lock.json, not ${version}`);
    }
  }

  while (pending.length > 0) {
    const location = pending.shift() ?? '';

    if (components.has(location)) {
      continue;
    }

    const entry = entries[location];

    components.set(location, componentOf(location, entry));
    dependencies.set(location, []);

    for (const name of namesBroughtBy(entry)) {
      const target = resolve(entries, location, name);

      if (target !== undefined) {
        dependencies.get(location)?.push(target);
        pending.push(target);
      }
    }
  }

  const refOf = (location) => components.get(location)?.['bom-ref'] ?? location;

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    // A reader that recognises the format by its fields asks for this one: `actions/attest` refuses a file without it.
    serialNumber: `urn:uuid:${serial}`,
    version: 1,
    metadata: {
      timestamp: now.toISOString(),
      tools: { components: [{ type: 'application', name: 'ddd-ts-kit pipeline/monorepo/sbom.mjs' }] },
      component: { type: 'library', 'bom-ref': `pkg:npm/ddd-ts-kit-release@${version}`, name: 'ddd-ts-kit', version },
    },
    components: [...components.values()].sort((left, right) => left['bom-ref'].localeCompare(right['bom-ref'])),
    dependencies: [
      { ref: `pkg:npm/ddd-ts-kit-release@${version}`, dependsOn: workspaces.map(refOf) },
      ...[...dependencies.entries()].map(([location, targets]) => ({
        ref: refOf(location),
        dependsOn: [...new Set(targets.map(refOf))].sort(),
      })),
    ].sort((left, right) => left.ref.localeCompare(right.ref)),
  };
}

function namesBroughtBy(entry) {
  return [...Object.keys(entry.dependencies ?? {}), ...Object.keys(entry.optionalDependencies ?? {})];
}

/**
 * Where Node finds `name` from the package at `location`: its own node_modules, then those of each
 * folder above it, up to the root. A link (a workspace) leads to the folder it names. An optional
 * dependency the lockfile did not install resolves to nothing.
 */
function resolve(entries, location, name) {
  const folders = location.split('/');

  for (let depth = folders.length; depth >= 0; depth -= 1) {
    const base = folders.slice(0, depth).join('/');
    const candidate = base === '' ? `node_modules/${name}` : `${base}/node_modules/${name}`;
    const entry = entries[candidate];

    if (entry !== undefined) {
      return entry.link === true ? entry.resolved : candidate;
    }
  }

  return undefined;
}

function componentOf(location, entry) {
  const name = entry.name ?? location.slice(location.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const purl = `pkg:npm/${name.replace(/^@/, '%40')}@${entry.version}`;
  const sha512 = /^sha512-(.+)$/.exec(entry.integrity ?? '')?.[1];

  return {
    type: 'library',
    'bom-ref': purl,
    name,
    version: entry.version,
    purl,
    ...(entry.license === undefined ? {} : { licenses: [{ expression: entry.license }] }),
    ...(sha512 === undefined
      ? {}
      : { hashes: [{ alg: 'SHA-512', content: Buffer.from(sha512, 'base64').toString('hex') }] }),
  };
}
