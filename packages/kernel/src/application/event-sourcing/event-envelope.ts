/** What a stored event says besides its data, handed to `decode` to build the domain event back. */
export interface EventEnvelope {
  /** The id the store holds the event under. */
  readonly id: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  /** Its rank in its stream, which the event built back is given: `rankOf(event)`. */
  readonly version: number;
}
