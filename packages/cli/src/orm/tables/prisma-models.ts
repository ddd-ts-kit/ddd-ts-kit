import { CliError } from '../../cli-error';
import {
  keepsSinglePrismaSchema,
  PRISMA_MAIN_SCHEMA,
  PRISMA_SCHEMA_FOLDER,
  prismaSchemaOf,
  schemaOfContext,
  singlePrismaSchemaFound,
  singlePrismaSchemaSteps,
  withDatasourceSchema,
} from '../../prisma-schema';
import { renderTemplate } from '../../templating';
import { declareOnce } from './declare-once';
import type { TablesDeclaration } from './tables-declaration';
import { templateOfTable } from './template-of-table';

/**
 * Prisma reads the files of one folder: the model joins the file of its context, which the worker
 * of the context owns, and the database schema of the context the datasource of the main file.
 */
export const prismaModels: TablesDeclaration = {
  declare(scope, context, declared) {
    const models = prismaSchemaOf(scope.context.kebab);

    if (keepsSinglePrismaSchema((file) => scope.ws.exists(file))) {
      throw new CliError(
        `${singlePrismaSchemaFound()} The model would go to ${models}, which Prisma reads only once prisma.config.ts names ${PRISMA_SCHEMA_FOLDER}.`,
        `${singlePrismaSchemaSteps(Object.keys(scope.config.contexts))} Then run this command again.`,
      );
    }

    if (scope.ws.read(models) === undefined) {
      scope.ws.create(models, renderTemplate('repository/prisma/schema.prisma.tpl', context));
    }

    declareOnce(
      scope,
      { file: models, declared },
      renderTemplate(templateOfTable(declared, 'prisma/model.tpl'), context),
    );

    const content = scope.ws.read(PRISMA_MAIN_SCHEMA);

    if (content !== undefined) {
      scope.ws.update(PRISMA_MAIN_SCHEMA, withDatasourceSchema(content, schemaOfContext(scope.context.kebab)));
    }

    scope.ws.note(`${models} changed: run \`npm run db:client\` to regenerate the client and the schema of the tests.`);
  },
  relist({ ws, context }) {
    const main = ws.read(PRISMA_MAIN_SCHEMA);

    if (main !== undefined && ws.exists(prismaSchemaOf(context.kebab))) {
      ws.update(PRISMA_MAIN_SCHEMA, withDatasourceSchema(main, schemaOfContext(context.kebab)));
    }
  },
};
