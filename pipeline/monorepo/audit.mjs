// The audit of the production dependencies: `npm audit --omit=dev` at the level `high`, with the
// advisories `audit-exceptions.json` acknowledges. An exception names one advisory, says why it
// cannot reach a project that uses the kit, and expires: past its date, or when the advisory is
// gone, it is reported, and the audit fails until the line is removed or renewed.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXCEPTIONS = path.join(ROOT, 'pipeline/monorepo/audit-exceptions.json');
const BLOCKING = new Set(['high', 'critical']);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}

function main() {
  const report = JSON.parse(npmAudit());
  const exceptions = JSON.parse(fs.readFileSync(EXCEPTIONS, 'utf8'));
  const { blocking, excused, stale } = verdictOf(report, exceptions, new Date());

  for (const advisory of excused) {
    console.log(`excused until ${advisory.until}: ${advisory.url} (${advisory.name}), ${advisory.reason}`);
  }

  for (const line of stale) {
    console.error(`audit-exceptions.json: ${line}`);
  }

  for (const advisory of blocking) {
    console.error(`${advisory.severity}: ${advisory.url} (${advisory.name}) ${advisory.title}`);
  }

  if (blocking.length === 0 && stale.length === 0) {
    console.log('No production dependency holds an advisory of severity high or critical that is not excused.');
  }

  return blocking.length === 0 && stale.length === 0 ? 0 : 1;
}

/** `npm audit` exits 1 when it finds anything: its report is what is read, not its code. */
function npmAudit() {
  try {
    return execFileSync('npm', ['audit', '--omit=dev', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 });
  } catch (error) {
    if (typeof error?.stdout === 'string' && error.stdout.trim().startsWith('{')) {
      return error.stdout;
    }

    throw error;
  }
}

/**
 * The advisories of severity high or critical the report holds, those an exception in force
 * excuses, and the exceptions to take up: expired, or naming an advisory the report no longer holds.
 */
export function verdictOf(report, exceptions, now) {
  const advisories = advisoriesOf(report).filter(({ severity }) => BLOCKING.has(severity));
  const inForce = exceptions.filter(({ until }) => new Date(`${until}T23:59:59Z`) >= now);
  const excusedBy = (advisory) => inForce.find(({ advisory: id }) => advisory.url.endsWith(`/${id}`));

  const blocking = advisories.filter((advisory) => excusedBy(advisory) === undefined);
  const excused = advisories.flatMap((advisory) => {
    const exception = excusedBy(advisory);

    return exception === undefined ? [] : [{ ...advisory, until: exception.until, reason: exception.reason }];
  });

  const stale = exceptions.flatMap(({ advisory: id, until }) => {
    if (!inForce.some((exception) => exception.advisory === id)) {
      return [`the exception of ${id} expired on ${until}: remove it, or renew it with a reason that still holds`];
    }

    return advisories.some(({ url }) => url.endsWith(`/${id}`))
      ? []
      : [`${id} is no longer reported: remove its exception`];
  });

  return { blocking, excused, stale };
}

/** Each advisory of the report once, by its url: a package lists the advisories it holds itself in `via`. */
function advisoriesOf(report) {
  const byUrl = new Map();

  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via) {
      if (typeof via === 'object' && !byUrl.has(via.url)) {
        byUrl.set(via.url, { url: via.url, name: via.name, title: via.title, severity: via.severity });
      }
    }
  }

  return [...byUrl.values()];
}
