/** A name the same command writes besides the one judged, typed as words (`order read`). */
export interface Alongside {
  readonly words: string;
  /** What it is, for the parsing of its words (`permission`). */
  readonly what: string;
  /** How a refusal calls it: `the permission "order.read"`. */
  readonly label: string;
}

export interface ConceptRole {
  readonly what: string;
  /** Role suffixes the generator adds itself, removed when the caller typed them. */
  readonly strip?: readonly string[];
  /** Lets a name Windows reserves through: `--allow-name` of the command, when the scope given to `concept` is not the command's own. */
  readonly allowReserved?: boolean;
  /**
   * False for a name whose words are not judged against the glossary, as an aggregate or a command
   * that exists already: a name Windows reserves gets through too, unless `allowReserved` says otherwise.
   */
  readonly judged?: false;
  /** The words of these the glossary lacks, and their technical words, are refused in the same message, not one run later. */
  readonly alongside?: readonly Alongside[];
}
