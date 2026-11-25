/** A test of a generated spec, as its template writes it: its title, then its body down to the line that closes it. */
const TEST = /^ {2}it\(('[^\n]*'), async \(\) => \{\n([\s\S]*?)^ {2}\}\);\n/gm;

/**
 * A rendered spec whose scenarios that wait for what still refuses are held by `pending(...)` of
 * `@ddd-ts-kit/testing/e2e`: it passes while their assertion fails and fails them once the code is
 * written, so that the spec is green as generated and says when to let go. The tests whose title
 * `waiting` matches are held, laid out as the formatter of a project writes such a call.
 */
export function heldScenarios(spec: string, waiting: RegExp): string {
  return spec.replace(TEST, (test: string, title: string, body: string) =>
    waiting.test(title) ? `  it(\n    ${title},\n    pending(async () => {\n${deeper(body)}    }),\n  );\n` : test,
  );
}

function deeper(body: string): string {
  return body
    .split('\n')
    .map((line) => (line === '' ? line : `  ${line}`))
    .join('\n');
}
