import { describe, expect, it } from 'vitest';
import { FixedClock } from '@ddd-ts-kit/kernel';
import { AuthorizationSetupError, PolicyAccess, definePolicy, type Policy } from '../src';
import { Article, author, publishingPermissions } from './support/articles';

const edit = publishingPermissions['article.edit'];
const draft = new Article('article-1', 'ada');

/** A policy whose `allows` answers what a slip or a cast lets through. */
function answering(verdict: unknown): PolicyAccess {
  const policy: Policy<unknown> = definePolicy({ name: 'article.slipped', permission: edit, allows: () => true });

  return new PolicyAccess({
    policies: [{ ...policy, allows: () => verdict as boolean }],
    clock: new FixedClock(new Date('2026-05-01T12:00:00.000Z')),
  });
}

describe('PolicyAccess, the verdict of a policy', () => {
  it.each([
    ['a promise of true', Promise.resolve(true)],
    ['a promise of false', Promise.resolve(false)],
    ['nothing', undefined],
    ['a text', 'yes'],
    ['a decision without its reason', { allowed: false }],
    ['a decision whose answer is a text', { allowed: 'true' }],
  ])('allows nobody and names the policy when it answers %s', async (_, verdict) => {
    const access = answering(verdict);

    const failure = new AuthorizationSetupError(
      'Policy "article.slipped" answered neither a boolean nor a decision: allows is synchronous.',
    );

    await expect(access.decide(author, edit, draft)).rejects.toEqual(failure);
    await expect(access.authorize(author, edit, draft)).rejects.toEqual(failure);
  });

  it('takes a boolean and a decision as they are', async () => {
    expect(await answering(true).decide(author, edit, draft)).toEqual({ allowed: true });
    expect(await answering({ allowed: true }).decide(author, edit, draft)).toEqual({ allowed: true });
    expect(await answering(false).decide(author, edit, draft)).toEqual({ allowed: false, reason: 'article.slipped' });

    expect(await answering({ allowed: false, reason: 'ARTICLE_FROZEN' }).decide(author, edit, draft)).toEqual({
      allowed: false,
      reason: 'ARTICLE_FROZEN',
    });
  });
});
