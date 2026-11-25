import { frozenCopy } from './frozen-copy';
import { sameValue } from './same-value';

/**
 * Immutable, compared by value, valid at construction. Subclass with a private constructor and
 * a `create` factory that validates, then returns the value object or throws the refusal of its
 * concept (or returns a `Result`, in a project that says `"stack.valueObjects": "result"`).
 *
 * It keeps a copy of its props, frozen in depth: the list, the record or the date it was built
 * from can change afterwards, the value object does not. A `Date` is the one value that cannot
 * be frozen: a getter that hands one to a caller it does not trust answers `new Date(..)` of it.
 */
export abstract class ValueObject<Props extends ValueObjectProps> {
  protected readonly props: Readonly<Props>;

  protected constructor(props: Props) {
    this.props = frozenCopy(props);
  }

  equals(other: ValueObject<Props> | undefined | null): boolean {
    return other?.constructor === this.constructor && sameValue(this.props, other.props);
  }

  toJSON(): Readonly<Props> {
    return this.props;
  }
}

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

/** The props of a value object: a `type` naming each value it holds. */
export type ValueObjectProps = { readonly [name: string]: PropValue };
