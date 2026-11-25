import { datasourceList } from './datasource-list';

/** The database schemas the datasource of a main schema file lists, in their order. */
export function datasourceSchemas(text: string): string[] {
  return datasourceList(text)?.items ?? [];
}
