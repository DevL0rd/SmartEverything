import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { ActionRow, ValueRow } from '../../../components/rows';
import { notifyFailure } from '../../../components/toast-store';
import {
  openAssistantSettings,
  openOverlaySettings,
  overlayStatus,
  type OverlayStatus,
} from './overlay-native';

export function useOverlayStatus(): OverlayStatus | null {
  const [status, setStatus] = useState<OverlayStatus | null>(() => overlayStatus());
  const refresh = useCallback(() => {
    setStatus(overlayStatus());
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
      }
    });
    return (): void => {
      subscription.remove();
    };
  }, [refresh]);
  return status;
}

function overlayStatusText(status: OverlayStatus | null): string {
  if (status === null) {
    return 'Needs an app update';
  }
  return status.canDrawOverlays
    ? 'Ready: call controls show over other apps'
    : 'Call controls show as a notification only';
}

export function showOverlaySettings(): void {
  openOverlaySettings().catch(notifyFailure('The settings did not open'));
}

export function OverlayPermissionRow(): ReactNode {
  const status = useOverlayStatus();
  return (
    <>
      <ValueRow
        title="Call controls"
        icon="smartphone"
        value={overlayStatusText(status)}
        wrapSubtitle
        {...(status?.assistantRole === true
          ? { subtitle: 'Wake words also work on the lock screen' }
          : {})}
      />
      {status?.canDrawOverlays === true ? null : (
        <ActionRow
          title="Show call controls over other apps"
          icon="sparkles"
          onPress={showOverlaySettings}
        />
      )}
      <ActionRow
        title="Make SmartEverything your assistant"
        subtitle="Lets a long press of the side key start a conversation, also on the lock screen."
        wrapSubtitle
        icon="mic"
        onPress={() => {
          openAssistantSettings().catch(notifyFailure('The settings did not open'));
        }}
      />
    </>
  );
}
