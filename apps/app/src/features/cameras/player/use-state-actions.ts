import { presentDevice, withRole, privacySwitchOf } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { confirm } from '../../../components/confirm-store';
import { useSizeClass } from '../../../design/size-class';
import { useControl } from '../../../store/control';
import { useLedger } from '../../../store/store-context';
import type { CameraEntry } from '../logic/cameras';
import type { StateActions } from './player-state-view';
import type { CameraSession } from './use-camera-session';
import { background } from '@smarteverything/logging';

function useRestart(entry: CameraEntry): (() => void) | null {
  const ledger = useLedger();
  const restart = withRole(presentDevice(entry.device), 'restart');
  if (restart?.writable !== true) {
    return null;
  }
  return (): void => {
    background(
      confirm({
        title: `Restart ${entry.name}?`,
        body: 'It goes offline for about a minute.',
        confirmLabel: 'Restart',
      }).then((accepted) => {
        if (accepted) {
          background(ledger.send(entry.device, restart.key, null), 'ledger.send_failed');
        }
      }),
      'use_state_actions.confirm_failed',
    );
  };
}

function usePrivacyOff(entry: CameraEntry): (() => void) | null {
  const privacy = privacySwitchOf(entry.device);
  const control = useControl(entry.device.id, privacy?.key ?? 'privacy_mode');
  return privacy?.writable === true
    ? (): void => {
        background(control.set(!privacy.privateWhen), 'control.set_failed');
      }
    : null;
}

export function useStateActions(entry: CameraEntry, session: CameraSession): StateActions {
  const desktop = useSizeClass().platform === 'desktop';
  return {
    retry: session.retry,
    restart: useRestart(entry),
    fix: desktop ? { kind: 'here', href: href.firewallFix() } : { kind: 'elsewhere' },
    turnOffPrivacy: usePrivacyOff(entry),
  };
}
