import { describe, expect, it } from 'vitest';
import { anonymousActor, anonymousSession, type Actor } from '@ddd-ts-kit/kernel';
import { passportPrincipal, type PassportStrategyLike } from '../src/passport';

/** A strategy that lets every request through as the same user. */
const succeeding: PassportStrategyLike = {
  authenticate(this: { success: (user: unknown) => void }) {
    this.success({ sub: 'grace' });
  },
};

const resolvedWith = (answered: unknown): Promise<unknown> =>
  passportPrincipal(succeeding, { actorOf: () => answered as Actor })({ headers: { authorization: 'Bearer good' } });

describe('passportPrincipal, what actorOf answers for a user the strategy authenticated', () => {
  it.each([
    ['nothing', undefined],
    ['an actor without attributes', { id: 'grace', type: 'user', roles: ['admin'] }],
    ['the user it was given', { sub: 'grace' }],
  ])('refuses the request, never serves it as nobody, when it answers %s', async (_, answered) => {
    await expect(resolvedWith(answered)).rejects.toThrow(
      'actorOf answered no actor for a user the strategy of Passport authenticated',
    );
  });

  it('goes on as the actor it answers, the anonymous one included when the mapper says so', async () => {
    const grace: Actor = { id: 'grace', type: 'user', roles: ['admin'], attributes: {} };

    await expect(resolvedWith(grace)).resolves.toMatchObject({ actor: grace });
    await expect(resolvedWith(anonymousActor())).resolves.toEqual(anonymousSession());
  });
});
