import { Linking } from 'react-native';
import { Logger, background } from '@smarteverything/logging';
import { parsePairingInvitation, type PairingInvitationParse } from '@smarteverything/domain';
import { ValueStore } from '../design/external-store';
import { appPlatform, desktopBridge } from '../design/platform';

const log = new Logger('app.pairing');
export const pendingPairingInvitation = new ValueStore<PairingInvitationParse | null>(null);
export function clearPairingInvitation(): void {
  pendingPairingInvitation.set(null);
}
function importPairingInvitation(text: string): PairingInvitationParse {
  if (appPlatform() !== 'android' && window.location.hash !== '') {
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  }
  const parsed = parsePairingInvitation(text);
  pendingPairingInvitation.set(parsed);
  return parsed;
}
function isPairingLink(text: string): boolean {
  if (!URL.canParse(text)) return false;
  const url = new URL(text);
  return (
    url.hash !== '' &&
    ((url.protocol === 'smarteverything:' && url.host === 'pair') ||
      (url.protocol === 'https:' && url.pathname === '/pair'))
  );
}
export function followPairingInvitations(imported: () => void): () => void {
  let active = true;
  const receive = (text: string): void => {
    if (!active || !isPairingLink(text)) return;
    importPairingInvitation(text);
    imported();
  };
  const failed = (error: unknown): void => {
    log.warn('pairing.invitation_link_failed', {
      failure: error instanceof Error ? error.name : 'NativeFailure',
    });
  };
  const bridge = desktopBridge();
  const desktop = bridge?.onDeepLink(receive);
  if (bridge !== null)
    background(
      bridge.takePendingDeepLinks().then((links) => {
        links.forEach(receive);
      }, failed),
      'pending_deep_links.take_failed',
    );
  const native = Linking.addEventListener('url', ({ url }) => {
    receive(url);
  });
  background(
    Linking.getInitialURL().then((url) => {
      if (url !== null) receive(url);
    }, failed),
    'initial_url.get_failed',
  );
  if (
    appPlatform() !== 'android' &&
    window.location.pathname === '/pair' &&
    window.location.hash !== ''
  )
    receive(window.location.href);
  return (): void => {
    active = false;
    desktop?.();
    native.remove();
    clearPairingInvitation();
  };
}
