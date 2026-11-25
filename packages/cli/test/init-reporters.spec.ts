import { describe, expect, it } from 'vitest';
import { read } from './helpers';
import { initProject } from './support/init-project';

describe('init test reporters', () => {
  it('keeps the reporters Vitest picks, a terse one under a coding agent, and adds the budget one', () => {
    const config = read(initProject(), 'vitest.config.ts');

    expect(config).toContain(
      "import { configDefaults, defineConfig, type TestProjectInlineConfiguration } from 'vitest/config';",
    );

    expect(config).toContain("reporters: [...configDefaults.reporters, '@ddd-ts-kit/testing/budget/vitest'],");
  });

  it('asks Jest for its summary reporter under a coding agent', () => {
    const config = read(initProject('--tests', 'jest'), 'jest.config.js');

    expect(config).toContain('const agent = Boolean(process.env.AI_AGENT || process.env.CLAUDECODE);');
    expect(config).toContain("reporters: [agent ? 'summary' : 'default', '@ddd-ts-kit/testing/budget/jest'],");
  });
});

describe('init test setup', () => {
  const RESTARTS =
    '// Before each test the sequences of the builders start again at 1 and the data generator at its seed: no value depends on the order of the tests of a file.';

  it('lists the setup entry that restarts the test data in every runner config of Vitest', () => {
    const project = initProject();

    for (const config of ['vitest.config.ts', 'vitest.e2e.config.ts', 'vitest.mutation.config.ts']) {
      expect(read(project, config), config).toContain(
        `    ${RESTARTS}\n    setupFiles: ['@ddd-ts-kit/testing/setup/vitest'],`,
      );
    }
  });

  it('lists it in every runner config of Jest, where beforeEach is a global', () => {
    const project = initProject('--tests', 'jest');

    for (const config of ['jest.config.js', 'jest.e2e.config.js', 'jest.mutation.config.js']) {
      expect(read(project, config), config).toContain(
        `  ${RESTARTS}\n  setupFilesAfterEnv: ['@ddd-ts-kit/testing/setup/jest'],`,
      );
    }
  });
});
