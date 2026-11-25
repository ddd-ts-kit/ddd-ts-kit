import { sameValue } from './same-value';
import type { ValueObjectProps } from './value-object-props';

/**
 * Immutable, compared by value, valid at construction. Subclass with a private constructor and
 * a `create` factory that validates, then returns the value object or throws the refusal of its
 * concept (or returns a `Result`, in a project that says `"stack.valueObjects": "result"`).
 */
export abstract class ValueObject<Props extends ValueObjectProps> {
  protected readonly props: Readonly<Props>;

  protected constructor(props: Props) {
    this.props = Object.freeze({ ...props });
  }

  equals(other: ValueObject<Props> | undefined | null): boolean {
    return other?.constructor === this.constructor && sameValue(this.props, other.props);
  }

  toJSON(): Readonly<Props> {
    return this.props;
  }
}
