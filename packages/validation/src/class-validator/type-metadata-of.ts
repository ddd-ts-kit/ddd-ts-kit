import type { TypeMetadata } from 'class-transformer';
import { defaultMetadataStorage } from 'class-transformer/cjs/storage.js';
import type { DtoClass } from './dto-class';

/** class-transformer answers `undefined` for a property without `@Type`, which its declaration does not say. */
export function typeMetadataOf(source: DtoClass<object>, property: string): TypeMetadata | undefined {
  return defaultMetadataStorage.findTypeMetadata(source, property);
}
