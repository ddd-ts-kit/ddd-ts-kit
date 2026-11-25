import { describe, expect, it } from 'vitest';
import { type CheckOptions, runCheck } from '../src/check/engine/run-check';
import { loadProject } from '../src/check/project/load-project';
import { checkJsonOf } from './check-support';
import { cli } from './helpers';
import { lines, projectWith } from './rules-support';

const SERVICE = 'src/contexts/billing/domain/services/dunning.service.ts';

const RECORD = {
  'docs/adr/0001-dunning.md': '# Decision\n\nContext, deviation, reason, scope, condition for removal.\n',
};

const DIRECTIVE = '// ddd-ts-kit-disable-next-line';
const WHY = '-- ADR-0001: the dunning run is replayed by hand';
const CLOCK = 'purity/no-system-clock';
const RANDOM = 'purity/no-ambient-randomness';
const BRACES = 'clean/braces';
const UNUSED = 'config/unused-suppression';
const FORM = 'config/suppression-needs-reason';
const JUDGED = [CLOCK, RANDOM, BRACES, UNUSED, FORM];

/** A domain service whose body is the lines given, in a project that records the decision the directives cite. */
function serviceWith(body: readonly string[], config: Record<string, unknown> = {}): string {
  return projectWith(
    { [SERVICE]: lines('export class DunningService {', ...body.map((line) => `  ${line}`), '}'), ...RECORD },
    config,
  );
}

/** What the rules about a line and about its directives report on the service, as `rule:line`. */
function found(root: string, options: CheckOptions = {}): string[] {
  return runCheck(loadProject(root), options)
    .violations.filter(({ file, ruleId }) => file === SERVICE && JUDGED.includes(ruleId))
    .map(({ ruleId, line }) => `${ruleId}:${line}`);
}

describe('a line that breaks two rules', () => {
  const both = 'readonly drawn = Date.now() + Math.random();';

  it('is reported for both', () => {
    expect(found(serviceWith([both]))).toEqual([`${RANDOM}:2`, `${CLOCK}:2`]);
  });

  it('is silenced by one directive that lists the two rules', () => {
    const root = serviceWith([`${DIRECTIVE} ${CLOCK}, ${RANDOM} ${WHY}`, both]);

    expect(found(root)).toEqual([]);
    expect(runCheck(loadProject(root))).toMatchObject({ suppressionCount: 1, suppressedCount: 2 });
  });

  it('is silenced by two directives one above the other, which both cover the line of code after them', () => {
    const root = serviceWith([`${DIRECTIVE} ${CLOCK} ${WHY}`, `${DIRECTIVE} ${RANDOM} ${WHY}`, both]);

    expect(found(root)).toEqual([]);
    expect(runCheck(loadProject(root))).toMatchObject({ suppressionCount: 2, suppressedCount: 2 });
  });

  it('keeps the rule a directive does not list', () => {
    expect(found(serviceWith([`${DIRECTIVE} ${CLOCK} ${WHY}`, both]))).toEqual([`${RANDOM}:3`]);
  });

  it('is not covered by a directive a line of code or a blank line separates from it', () => {
    const apart = serviceWith([`${DIRECTIVE} ${BRACES} ${WHY}`, '', 'pay(paid: boolean): void { if (paid) return; }']);

    expect(found(apart)).toEqual([`${UNUSED}:2`, `${BRACES}:4`]);
  });
});

describe('a directive that names a rule the checker does not know', () => {
  const unknown = [`${DIRECTIVE} purity/no-system-clok ${WHY}`, 'readonly drawn = Date.now();'];

  it('is reported, with the id it names, and silences nothing', () => {
    const root = serviceWith(unknown);
    const [violation] = runCheck(loadProject(root)).violations.filter(({ ruleId }) => ruleId === UNUSED);

    expect(found(root)).toEqual([`${UNUSED}:2`, `${CLOCK}:3`]);
    expect(violation?.message).toBe('The suppression names "purity/no-system-clok", which is no rule.');
    expect(violation?.fix).toContain('ddd-ts-kit rules');
  });

  it('is reported for the unknown id of a list alone', () => {
    const root = serviceWith([`${DIRECTIVE} ${CLOCK}, no-such/rule ${WHY}`, 'readonly drawn = Date.now();']);

    expect(found(root)).toEqual([`${UNUSED}:2`]);
  });

  it('is reported under --rule and by check-file, which need no other rule to know it', () => {
    const root = serviceWith(unknown);

    expect(found(root, { rules: [UNUSED] })).toEqual([`${UNUSED}:2`]);

    expect(checkJsonOf(cli(root, 'check-file', SERVICE, '--json')).violations.map(({ ruleId }) => ruleId)).toEqual(
      expect.arrayContaining([UNUSED, CLOCK]),
    );
  });

  it('knows a rule ESLint holds alone, whose directive ESLint reads', () => {
    expect(found(serviceWith([`${DIRECTIVE} domain/no-generic-error ${WHY}`, 'readonly drawn = 1;']))).toEqual([]);
  });
});

describe('a directive that silences nothing', () => {
  const idle = [`${DIRECTIVE} ${BRACES} ${WHY}`, 'readonly drawn = 1;'];
  const used = [`${DIRECTIVE} ${BRACES} ${WHY}`, 'pay(paid: boolean): void { if (paid) return; }'];

  it('is reported by a run of every rule, and not while it silences a finding', () => {
    const root = serviceWith(idle);
    const [violation] = runCheck(loadProject(root)).violations.filter(({ ruleId }) => ruleId === UNUSED);

    expect(found(root)).toEqual([`${UNUSED}:2`]);
    expect(violation?.message).toBe(`The suppression of "${BRACES}" silences nothing: line 3 does not break the rule.`);
    expect(found(serviceWith(used))).toEqual([]);
  });

  it('is reported for the idle rule of a list alone', () => {
    const root = serviceWith([`${DIRECTIVE} ${BRACES}, clean/blank-lines ${WHY}`, used[1] ?? '']);
    const [violation] = runCheck(loadProject(root)).violations.filter(({ ruleId }) => ruleId === UNUSED);

    expect(violation).toMatchObject({
      line: 2,
      message: 'The suppression of "clean/blank-lines" silences nothing: line 3 does not break the rule.',
    });
  });

  it('is not judged by a run of some rules, nor by check-file, which do not know what the others would find', () => {
    const root = serviceWith(idle);

    expect(found(root, { rules: [UNUSED] })).toEqual([]);
    expect(found(root, { rules: [UNUSED, BRACES] })).toEqual([]);
    expect(cli(root, 'check', '--rule', UNUSED, '--json').json()).toMatchObject({ ok: true });

    expect(
      checkJsonOf(cli(root, 'check-file', SERVICE, '--json')).violations.map(({ ruleId }) => ruleId),
    ).not.toContain(UNUSED);
  });

  it('is not judged for a rule that is off, for the project or for the file', () => {
    const deviations = [{ what: `rules.${BRACES}`, adr: '0001', reason: 'One-line guards are kept.' }];
    const forSomeFiles = { severity: 'off', files: ['src/contexts/billing/domain/services/**'] };

    expect(found(serviceWith(idle, { rules: { [BRACES]: 'off' }, deviations }))).toEqual([]);
    expect(found(serviceWith(idle, { rules: { [BRACES]: forSomeFiles }, deviations }))).toEqual([]);
  });

  it('is not judged for a rule ESLint judges too: the syntax tree may find what the text reading does not', () => {
    expect(found(serviceWith([`${DIRECTIVE} ${CLOCK} ${WHY}`, 'readonly drawn = 1;']))).toEqual([]);
  });

  it('is said by check, which exits 1, and is off when its rule is', () => {
    const report = checkJsonOf(cli(serviceWith(idle), 'check', '--json'));
    const deviations = [{ what: `rules.${UNUSED}`, adr: '0001', reason: 'Directives are reviewed by hand.' }];

    expect(report.violations.filter(({ ruleId }) => ruleId === UNUSED)).toMatchObject([
      { severity: 'error', file: SERVICE, line: 2 },
    ]);

    expect(found(serviceWith(idle, { rules: { [UNUSED]: { severity: 'off', files: ['**'] } }, deviations }))).toEqual(
      [],
    );
  });
});

describe('the form of a directive', () => {
  it('is judged like any rule: a list without a reason is reported once, and silences nothing', () => {
    const root = serviceWith([`${DIRECTIVE} ${CLOCK}, ${RANDOM}`, 'readonly drawn = Date.now() + Math.random();']);
    const [violation] = runCheck(loadProject(root)).violations.filter(({ ruleId }) => ruleId === FORM);

    expect(found(root)).toEqual([`${FORM}:2`, `${RANDOM}:3`, `${CLOCK}:3`]);
    expect(violation?.message).toBe(`The suppression of "${CLOCK}", "${RANDOM}" gives no reason.`);
  });

  it('covers the first line of a file from the directives that open it, where a finding about the whole file lands', () => {
    const misnamed = 'src/contexts/billing/domain/aggregates/invoice.ts';

    const root = projectWith({
      [misnamed]: lines(
        `${DIRECTIVE} naming/suffix ${WHY}`,
        `${DIRECTIVE} ${CLOCK} ${WHY}`,
        'export const at = Date.now();',
      ),
      ...RECORD,
    });

    const reported = runCheck(loadProject(root)).violations.filter(({ file }) => file === misnamed);

    expect(reported.map(({ ruleId }) => ruleId).filter((id) => ['naming/suffix', CLOCK, UNUSED].includes(id))).toEqual(
      [],
    );
  });
});
