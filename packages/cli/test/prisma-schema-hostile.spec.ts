import { describe, expect, it } from 'vitest';
import { CliError } from '../src/cli-error';
import { datasourceSchemas, previewFeaturesOf, withDatasourceSchema, withPreviewFeature } from '../src/prisma-schema';

const GENERATOR = ['generator client {', '  provider = "prisma-client"', '}', ''];

function datasource(...schemas: readonly string[]): string[] {
  return ['datasource db {', '  provider = "postgresql"', ...schemas, '}', ''];
}

describe('the schemas of the datasource of a Prisma schema', () => {
  it('are read and written in the datasource, never in a comment that shows a list', () => {
    const comment = '// schemas = ["legacy"] was the old list';
    const schema = [comment, ...datasource('  schemas  = ["messaging"] // schemas = ["later"]')].join('\n');

    expect(datasourceSchemas(schema)).toEqual(['messaging']);

    expect(withDatasourceSchema(schema, 'legacy')).toBe(
      [comment, ...datasource('  schemas  = ["messaging", "legacy"] // schemas = ["later"]')].join('\n'),
    );
  });

  it('fill an empty list, and follow the last schema of a list on several lines, its comma kept', () => {
    expect(withDatasourceSchema(datasource('  schemas = []').join('\n'), 'billing')).toBe(
      datasource('  schemas = ["billing"]').join('\n'),
    );

    expect(
      withDatasourceSchema(
        datasource('  schemas = [', '    "messaging", // the outbox', '    "audit",', '  ]').join('\n'),
        'billing',
      ),
    ).toBe(datasource('  schemas = [', '    "messaging", // the outbox', '    "audit", "billing",', '  ]').join('\n'));
  });

  it('are left as they are when the list holds the schema, a schema that only starts like it aside', () => {
    const schema = datasource('  schemas = ["billing_archive"]').join('\n');

    expect(withDatasourceSchema(schema, 'billing_archive')).toBe(schema);
    expect(withDatasourceSchema(schema, 'billing')).toContain('schemas = ["billing_archive", "billing"]');
  });

  it('are refused, with the line to write by hand, when the datasource lists none', () => {
    const refused = (() => {
      try {
        return withDatasourceSchema([...GENERATOR, ...datasource()].join('\n'), 'billing');
      } catch (error) {
        return error;
      }
    })();

    expect(refused).toBeInstanceOf(CliError);

    expect(refused).toMatchObject({
      message:
        'prisma/schema/schema.prisma: the datasource lists no `schemas = [...]` the generator can add "billing" to.',
      fix: 'Write `schemas = ["billing"]` in the datasource of that file, with the schemas it already uses, then run the command again.',
    });
  });
});

describe('the preview features of the generator of the client', () => {
  it('are written in the generator of the client, never in a generator of the same body before it', () => {
    const other = ['generator other {', '  provider = "prisma-client"', '}', ''];
    const schema = [...other, ...GENERATOR].join('\n');

    expect(withPreviewFeature(schema, 'partialIndexes')).toBe(
      [
        ...other,
        'generator client {',
        '  provider = "prisma-client"',
        '  previewFeatures = ["partialIndexes"]',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('are read and added in the code of the generator, a comment that lists some aside', () => {
    const schema = [
      'generator client {',
      '  // previewFeatures = ["views"]',
      '  provider        = "prisma-client"',
      '  previewFeatures = ["relationJoins"]',
      '}',
      '',
    ].join('\n');

    expect(previewFeaturesOf(schema)).toEqual(['relationJoins']);
    expect(withPreviewFeature(schema, 'views')).toContain('  previewFeatures = ["relationJoins", "views"]\n}');
    expect(withPreviewFeature(schema, 'relationJoins')).toBe(schema);
  });
});
