import type { Chosen } from '../representation/representations';

/** How the answer of a request is written. */
export interface Writing {
  /** The representation the request negotiated; `undefined` when nothing was, and the answer is JSON. */
  readonly chosen: Chosen | undefined;
  /** The content type the handler set itself, if it did. */
  readonly ownContentType: string | undefined;
  /** Told of a list that fails once its status is sent. */
  readonly interrupted: (error: unknown) => void;
}
