import type { PropValue } from './prop-value';

/** The props of a value object: a `type` naming each value it holds. */
export type ValueObjectProps = { readonly [name: string]: PropValue };
