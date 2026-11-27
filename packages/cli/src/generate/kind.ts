import type { Arguments, OptionSpecs } from '../commands/arguments';
import type { Config } from '../config';
import type { Workspace } from '../workspace';
import type { GeneratorProbe } from './generator-probe';
import type { SharedWrite } from './shared-write';

/** What a kind is asked to write: where, its arguments and its flags. */
export interface KindRequest {
  readonly ws: Workspace;
  readonly config: Config;
  /** Positional arguments after the kind. */
  readonly args: readonly string[];
  /**
   * The flags of the command line, read with those of every kind (`generateOptionsOn`): the kind
   * reads its own as it declares them, `generate` having refused those of another kind.
   */
  readonly flags: Arguments<string, string, string>;
  /** What `plan-waves` hears of the command: the names to judge, in place of the judgement, and each file it builds on. */
  readonly probe?: GeneratorProbe | undefined;
}

/**
 * Where a kind writes, which its first argument says: a context of the project, or the shared
 * kernel too (`shared-kernel`), the context it creates, or the project itself.
 */
export type KindScope = 'context' | 'context-or-shared-kernel' | 'new-context' | 'project';

export interface Kind {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly summary: string;
  /** Where it writes: under `context` and `context-or-shared-kernel`, its first argument names the context. */
  readonly scope: KindScope;
  /** Positional arguments after the kind and the context it writes in, by name; all are required. */
  readonly positionals: readonly string[];
  /** Positional arguments that may follow the required ones, by name: `[Name]` of a world. */
  readonly optionalPositionals?: readonly string[];
  /** How the usage writes a positional argument it does not write `<name>`, or `[name]` when optional: `"<title>"`. */
  readonly shown?: Readonly<Record<string, string>>;
  /**
   * Its own flags, declared as a command declares its options, from which its usage is written:
   * `--module` aside, which `writesInModules` says, and the flags every kind takes.
   */
  readonly options: OptionSpecs;
  /**
   * Its flags as the usage writes them, by hand, when the declarations do not say it: forms that
   * exclude each other, a flag it requires, one that goes with another only. Left out, each flag is
   * written between brackets, in the order it declares them.
   */
  readonly shownOptions?: string;
  /**
   * What it may write outside the context it is given (config, composition root, registries of
   * the platform, documentation), and when; left out, it writes nothing shared. `--local-only`
   * refuses those writes, the conductor of a parallel build makes them on the trunk.
   */
  readonly shared?: SharedWrite;
  /** Said by `module`, which declares a module and writes no file of a layer: it runs in a context not laid out yet. */
  readonly declaresModule?: true;
  /**
   * True when the kind writes a file that the modules of the model of a context divide: a file of
   * a layer or a spec that `isContextLevel` does not keep at the level of the context. Such a kind
   * takes `--module` and its usage shows it (`usageOf`); every other kind refuses it, what it writes
   * staying at the level of the context or outside the contexts. `module-usage.spec.ts` runs every
   * kind in a context divided into modules to keep this true.
   */
  readonly writesInModules: boolean;
  run(request: KindRequest): void;
}
