import { beforeEach, describe, expect, it, vi } from 'vitest';

const forgetServer = vi.hoisted(() => vi.fn());
const forgetThisPhone = vi.hoisted(() => vi.fn());

vi.mock('../../../api/transport', () => ({ forgetServer }));
vi.mock('../../../platform/push', () => ({ forgetThisPhone }));

import { forgetPairing } from './forget-pairing';

beforeEach(() => {
  forgetServer.mockReset().mockResolvedValue(undefined);
  forgetThisPhone.mockReset();
});

describe('forgetting this pairing', () => {
  it('forgets the server after the hub has dropped this phone', async () => {
    forgetThisPhone.mockResolvedValue(undefined);
    await forgetPairing();
    expect(forgetServer).toHaveBeenCalledTimes(1);
  });

  it('forgets the server when the hub is unreachable', async () => {
    forgetThisPhone.mockRejectedValue(new Error('fetch failed'));
    await forgetPairing();
    expect(forgetServer).toHaveBeenCalledTimes(1);
  });
});
