import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { inContext } from '../support/in-context';

/** The folders of a context that hold specs, and nothing else. */
const SPEC_FOLDERS = new Set(['unit', 'integration']);

/** A spec, as the test runners of the kit find one; a declaration file holds no code. */
const NOT_A_HELPER = /\.(?:spec|test|d)\.ts$/;

export const testHelperPlaced: FileRule = {
  id: 'test/helper-placed',
  description:
    "A file of a context's test/unit/ or test/integration/ is a spec: an arrangement several specs share is a world of test/worlds/, test data a builder of test/builders/, an in-memory port a fake of test/fakes/.",
  severity: 'warn',
  doc: {
    why: 'test/unit/ and test/integration/ hold specs. A helper written among them (an arrange function several specs import, a factory of test data, an in-memory class) has no name a reader can look for, and the next spec copies it instead of finding it. Each has its place: the arrangement several specs of the context share, the test application or the buses with the fakes of the context, is a world of test/worlds/*.world.ts (generate test-world writes one from the fakes of the context); test data is a builder of test/builders/; an in-memory implementation of a port is a fake of test/fakes/. A file whose name ends with .spec.ts, .test.ts or .d.ts is not reported. It is a warning.',
    bad: `test/unit/scheduling-application.ts   // imported by four handler specs`,
    good: `// test/worlds/scheduling.world.ts, written by \`npx ddd-ts-kit generate test-world scheduling\`
const { application, appointmentRepository } = await aSchedulingWorld({ now: NOW });`,
  },
  scope: 'file',
  judge(file) {
    const helper = helperOf(file);

    if (helper === undefined) {
      return [];
    }

    const { context, place } = helper;

    return [
      {
        line: 1,
        message: `"${place}" is a helper among the specs of the context ${context}.`,
        fix: `Move it to test/worlds/ (an arrangement several specs share: \`npx ddd-ts-kit generate test-world ${context}\` writes one), test/builders/ (test data) or test/fakes/ (an in-memory port).`,
      },
    ];
  },
};

interface Helper {
  readonly context: string;
  /** The path of the file inside its context. */
  readonly place: string;
}

/** A file that sits among the specs of its context without being one. */
function helperOf(file: SourceFile): Helper | undefined {
  const { location } = file;

  if (!inContext(location) || location.layer !== 'test') {
    return undefined;
  }

  const [folder = '', ...rest] = location.inside;
  const name = rest.at(-1) ?? '';

  if (!SPEC_FOLDERS.has(folder) || !name.endsWith('.ts') || NOT_A_HELPER.test(name)) {
    return undefined;
  }

  return { context: location.context, place: `test/${location.inside.join('/')}` };
}
