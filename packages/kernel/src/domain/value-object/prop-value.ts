import type { ValueObject } from './value-object';
import type { ValueObjectProps } from './value-object-props';

/**
 * What a value object may hold, because it can be copied, frozen and compared: a primitive, a
 * date, another value object, a list or a plain record of those. A `Map`, a `Set`, an entity or
 * an instance of any other class does not compile: hold its content as plain data.
 */
export type PropValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | Date
  | ValueObject<ValueObjectProps>
  | readonly PropValue[]
  | { readonly [name: string]: PropValue };
