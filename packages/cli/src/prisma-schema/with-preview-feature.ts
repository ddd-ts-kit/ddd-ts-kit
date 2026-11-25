import { SchemaBlock } from './schema-block';

const KEY = 'previewFeatures';

/** The generator of the client with `feature` among its preview features, its assignments kept aligned. */
export function withPreviewFeature(schema: string, feature: string): string {
  const generator = SchemaBlock.of(schema, 'generator\\s+client');

  if (generator === undefined) {
    return schema;
  }

  return generator.list(KEY)?.with(feature) ?? generator.withAssignment(KEY, `["${feature}"]`);
}
