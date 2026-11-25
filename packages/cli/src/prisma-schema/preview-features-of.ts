import { SchemaBlock } from './schema-block';

/** The preview features the generator of the client of a main schema file turns on. */
export function previewFeaturesOf(schema: string): string[] {
  return SchemaBlock.of(schema, 'generator\\s+client')?.list('previewFeatures')?.items ?? [];
}
