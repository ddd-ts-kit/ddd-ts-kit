**English** · [Français](SECURITY.fr.md)

# Security policy

## Supported versions

Only the latest version published on npm and the `main` branch receive security fixes. A fix
lands on `main` and ships in the next release of every package; an older version is not
patched, so upgrade to the latest one ([Versions and stability](docs/versioning.md) says what an
upgrade asks for).

## Reporting a vulnerability

Do not open a public issue for a vulnerability.

Report it privately through
[GitHub private vulnerability reporting](https://github.com/ddd-ts-kit/ddd-ts-kit/security/advisories/new).
Say what is affected (a package, the CLI, a generated template, the plugin hook, a pipeline
asset), how to reproduce it and what an attacker gains.

You can expect an acknowledgement within seven days. A confirmed vulnerability is fixed on
`main` and shipped in a new version, then disclosed in a GitHub security advisory that credits
the reporter unless they ask otherwise.

## Verifying a release

Every package is published from the `Release` workflow of this repository, never from a
machine: npm shows its provenance on the page of each version (`npm audit signatures` checks it
in a project). From version 0.114.0, each tarball is also attested by GitHub with where and from
which commit it was built, and with the bill of materials of the release (CycloneDX), attached to
the GitHub release:

```bash
npm pack @ddd-ts-kit/kernel@<version>
gh attestation verify ddd-ts-kit-kernel-<version>.tgz --repo ddd-ts-kit/ddd-ts-kit
gh attestation verify ddd-ts-kit-kernel-<version>.tgz --repo ddd-ts-kit/ddd-ts-kit \
  --predicate-type https://cyclonedx.org/bom
```

## Scope

In scope: the code of this repository, including what `ddd-ts-kit init` and
`ddd-ts-kit generate` write into a consuming project, since a flaw in a template is repeated
in every project generated from it.

Out of scope: a vulnerability of a third-party dependency with no impact through this
repository (report it upstream), and the application under `examples/`, which runs with
development credentials and is not meant to be deployed as is.
