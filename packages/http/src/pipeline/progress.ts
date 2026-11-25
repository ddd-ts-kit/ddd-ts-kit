import type { ExecutionContext } from '@ddd-ts-kit/kernel';

/**
 * How far a request went, told by each step as it passes: the error hook says who was refused
 * once the caller is identified, and the tags of an answer are read from the parameters once
 * they are validated.
 */
export class Progress {
  private identifiedAs: ExecutionContext | undefined;

  private validatedParams: unknown;

  /** The caller is known, and where it acts: a refusal from here on says so. Told again once the tenant of the request is resolved. */
  identified(execution: ExecutionContext): ExecutionContext {
    this.identifiedAs = execution;

    return execution;
  }

  validated(params: unknown): void {
    this.validatedParams = params;
  }

  get execution(): ExecutionContext | undefined {
    return this.identifiedAs;
  }

  get params(): unknown {
    return this.validatedParams;
  }
}
