import { ApiError, HUB_GUARD_MESSAGE } from '@smarteverything/domain';

export type HubConfirmOutcome = 'sent' | 'cancelled';

function isHubGuard(error: unknown): boolean {
  return error instanceof ApiError && error.message === HUB_GUARD_MESSAGE;
}

export async function sendConfirmingHub(
  send: (confirmed: boolean) => Promise<unknown>,
  ask: () => Promise<boolean>,
): Promise<HubConfirmOutcome> {
  try {
    await send(false);
    return 'sent';
  } catch (error) {
    if (!isHubGuard(error)) throw error;
    if (!(await ask())) return 'cancelled';
    await send(true);
    return 'sent';
  }
}
