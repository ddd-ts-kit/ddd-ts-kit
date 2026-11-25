import type { Finding } from '../model/finding';
import type { Report } from '../model/report';
import type { Violation } from '../model/violation';

/** Reports what was found while judging `file`: there, and at the severity of the rule, unless a finding says otherwise. */
export function toViolations(report: Report, file: string, findings: readonly Finding[]): Violation[] {
  return findings.map(({ line, message, fix, subjects, severity, file: elsewhere }) => {
    const violation = report({ file: elsewhere ?? file, line, subjects }, message, fix);

    return severity === undefined ? violation : { ...violation, severity };
  });
}
