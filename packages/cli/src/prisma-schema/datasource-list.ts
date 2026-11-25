import { SchemaBlock } from './schema-block';
import type { SchemaList } from './schema-list';

/** The list `schemas` of the datasource of a main schema file, undefined when the file has no datasource or it lists none. */
export function datasourceList(text: string): SchemaList | undefined {
  return SchemaBlock.of(text, 'datasource\\s+\\w+')?.list('schemas');
}
