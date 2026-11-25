import type { AccessScope } from '../authorization/access-scope';
import type { Authorizer } from '../authorization/authorizer';
import type { CheckRequest } from '../authorization/check-request';
import { deny, type Decision } from '../authorization/decision';
import { DenialReason } from '../authorization/denial-reason';
import type { Explanation } from '../authorization/explanation';
import type { ListRequest } from '../authorization/list-request';
import { Trace } from '../authorization/trace';
import { ListingNotSupportedError } from '../errors/listing-not-supported-error';
import { Tenancy } from './tenancy';
import type { TenancyOptions } from './tenancy-options';

export interface TenantBoundAuthorizerOptions extends TenancyOptions {
  /** The model of the project, whatever it is and whatever stands in front of it: it decides first. */
  readonly model: Authorizer;
}

/**
 * Holds any model to the tenants of the actor: what the model allows is refused when the request
 * targets a tenant the actor does not belong to, or another tenant than the one the work runs
 * in, and what it lists is kept to one tenant. The outermost authorizer of a project with
 * tenants, so that nothing placed in front of the model answers before the tenant is checked.
 */
export class TenantBoundAuthorizer implements Authorizer {
  private readonly tenancy: Tenancy;

  constructor(private readonly options: TenantBoundAuthorizerOptions) {
    this.tenancy = new Tenancy(options);
  }

  async check(request: CheckRequest): Promise<Decision> {
    return this.inTenant(request, await this.options.model.check(request), new Trace());
  }

  /** Why: the lines of the model, then where the request may act when the model allows it. */
  async explain(request: CheckRequest): Promise<Explanation> {
    const { model } = this.options;
    const trace = new Trace();

    if (model.explain === undefined) {
      return { decision: await this.inTenant(request, await model.check(request), trace), trace: trace.lines };
    }

    const explained = await model.explain(request);
    const decision = await this.inTenant(request, explained.decision, trace);

    return { decision, trace: [...explained.trace, ...trace.lines] };
  }

  async listAccessible(request: ListRequest): Promise<AccessScope> {
    const { model } = this.options;

    if (model.listAccessible === undefined) {
      throw new ListingNotSupportedError();
    }

    return this.tenancy.narrowed(await model.listAccessible(request), request);
  }

  /** A refusal of the model stands as it is: the tenant is asked about what the model allows. */
  private async inTenant(request: CheckRequest, decision: Decision, trace: Trace): Promise<Decision> {
    if (!decision.allowed || (await this.tenancy.admits(request, trace))) {
      return decision;
    }

    return deny(DenialReason.tenantMismatch);
  }
}
