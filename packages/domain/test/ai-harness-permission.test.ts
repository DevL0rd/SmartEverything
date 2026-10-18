import { describe, expect, it } from 'vitest';
import {
  AI_HARNESS_PERMISSION,
  AI_HARNESS_PERMISSIONS,
  AI_HARNESS_PERMISSION_WRITE,
  DEFAULT_AI_HARNESS_PERMISSION,
} from '../src';

describe('the permission a chat can run with', () => {
  it.each(AI_HARNESS_PERMISSIONS)(
    'accepts the offered policy $sandbox with $approval',
    (policy) => {
      expect(AI_HARNESS_PERMISSION.parse(policy)).toStrictEqual(policy);
      expect(AI_HARNESS_PERMISSION_WRITE.parse(policy)).toStrictEqual(policy);
    },
  );

  it.each([
    { sandbox: 'danger-full-access', approval: 'on-request' },
    { sandbox: 'read-only', approval: 'never' },
    { sandbox: 'workspace-write', approval: 'never' },
    { sandbox: 'read-only', approval: 'untrusted' },
    { sandbox: 'workspace-write', approval: 'on-failure' },
  ])('rejects the combination no host offers: $sandbox with $approval', (policy) => {
    expect(AI_HARNESS_PERMISSION.safeParse(policy).success).toBe(false);
  });

  it('starts a chat with full access and no routine approvals', () => {
    expect(DEFAULT_AI_HARNESS_PERMISSION).toStrictEqual({
      sandbox: 'danger-full-access',
      approval: 'never',
    });
  });
});
