import { afterEach, describe, expect, it } from 'vitest';
import { pendingConfirm, settleConfirm } from '../../components/confirm-store';
import { RESTART_ROUTER, RESTART_WIFI, blockInternet } from '../router/router-confirmations';
import { overrideFolder, revertFolder } from '../syncthing/syncthing-confirmations';
import { confirmed } from './confirmed';

afterEach(() => {
  settleConfirm(false);
});

describe('confirmed', () => {
  it('runs straight away when the action has no confirmation', async () => {
    await expect(confirmed(undefined)).resolves.toBe(true);
    expect(pendingConfirm.get()).toBeNull();
  });

  it('asks first and resolves with the answer', async () => {
    const answer = confirmed(RESTART_ROUTER);
    expect(pendingConfirm.get()?.title).toBe(RESTART_ROUTER.title);
    settleConfirm(false);
    await expect(answer).resolves.toBe(false);
    const second = confirmed(RESTART_ROUTER);
    settleConfirm(true);
    await expect(second).resolves.toBe(true);
  });
});

describe('destructive plugin actions', () => {
  it.each([
    RESTART_ROUTER,
    RESTART_WIFI,
    blockInternet('Kitchen tablet'),
    overrideFolder('Photos'),
    revertFolder('Photos'),
  ])('asks with the destructive tone and says what happens: $title', (request) => {
    expect(request.tone).toBe('destructive');
    expect(request.body).toBeTruthy();
  });

  it('names the device and folder that would be affected', () => {
    expect(blockInternet('Kitchen tablet').title).toContain('Kitchen tablet');
    expect(overrideFolder('Photos').body).toContain('Photos');
    expect(revertFolder('Photos').body).toContain('Photos');
  });
});
