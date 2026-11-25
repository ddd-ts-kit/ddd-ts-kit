/**
 * Where a domain event carries its rank in the history of its aggregate, out of enumeration:
 * comparing, spreading or serialising an event never sees it. `ranked` gives the rank, `rankOf`
 * reads it. Shared across the copies of the kernel a process loads: an event ranked by one copy is
 * read by another.
 */
export const EVENT_RANK = Symbol.for('@ddd-ts-kit/kernel/event-rank/v1');
