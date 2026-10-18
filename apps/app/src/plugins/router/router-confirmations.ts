import type { ConfirmRequest } from '../../components/confirm-store';

export const RESTART_WIFI: ConfirmRequest = {
  title: 'Restart Wi-Fi?',
  body: 'Everyone on Wi-Fi drops for about a minute.',
  confirmLabel: 'Restart Wi-Fi',
  tone: 'destructive',
};

export const RESTART_ROUTER: ConfirmRequest = {
  title: 'Restart the router?',
  body: 'The whole home is offline for a few minutes.',
  confirmLabel: 'Restart',
  tone: 'destructive',
};

export function blockInternet(name: string): ConfirmRequest {
  return {
    title: `Block ${name}?`,
    body: 'It loses its internet connection until you allow it again.',
    confirmLabel: 'Block',
    tone: 'destructive',
  };
}
