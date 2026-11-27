import type { ArgumentsOf, OptionSpecs } from '../commands/arguments';
import type { KindRequest } from './kind';
import type { EVERY_KIND } from './kind-options';

/** The flags of a kind that declares the options `O`, read as it declares them, with the flags every kind takes. */
export type KindFlags<O extends OptionSpecs> = ArgumentsOf<typeof EVERY_KIND & O>;

/** What the run of a kind is given: the request, its flags read as it declares them. */
export interface ReadRequest<O extends OptionSpecs> extends Omit<KindRequest, 'flags'> {
  readonly flags: KindFlags<O>;
  /** The module of the model `--module` names, for a kind that writes into one. */
  readonly module: string | undefined;
}
