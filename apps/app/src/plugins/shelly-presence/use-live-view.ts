import { useEffect, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { Logger } from '@smarteverything/logging';
import {
  SHELLY_PRESENCE_LIVE_VIEW_RESULT,
  SHELLY_PRESENCE_PLUGIN_ID,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
import { callPluginTool } from '../../api/plugins';
import { useForeground } from '../../design/animation-gate';

const log = new Logger('app.shelly-presence');

async function lease(externalId: string, enabled: boolean): Promise<unknown> {
  return (await callPluginTool(SHELLY_PRESENCE_PLUGIN_ID, 'set_live_view', { externalId, enabled }))
    .result;
}

function openLease(
  externalId: string,
  accepted: (expiresAt: string) => void,
  failed: (reason: string) => void,
): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const release = (): void => {
    void lease(externalId, false).catch((caught: unknown) => {
      log.warn('live_view.release_failed', {
        errorKind: caught instanceof Error ? caught.name : typeof caught,
      });
    });
  };
  const renew = async (): Promise<void> => {
    try {
      const result = SHELLY_PRESENCE_LIVE_VIEW_RESULT.parse(await lease(externalId, true));
      if (cancelled) {
        release();
        return;
      }
      if (!result.enabled || result.expiresAt === null || result.renewAfterMs === null)
        throw new Error('The server did not grant a live viewer lease.');
      accepted(result.expiresAt);
      timer = setTimeout(() => {
        void renew();
      }, result.renewAfterMs);
    } catch (caught) {
      if (!cancelled) failed(caught instanceof Error ? caught.message : String(caught));
    }
  };
  void renew();
  return (): void => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    release();
  };
}

export interface LiveView {
  readonly enabled: boolean;
  readonly active: boolean;
  readonly expiresAt: string | null;
  readonly error: string | null;
  readonly toggle: () => void;
}

export function useLiveView(sensor: ShellyPresenceDevice): LiveView {
  const [enabled, setEnabled] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focused = useIsFocused();
  const foreground = useForeground();
  const active = enabled && focused && foreground && sensor.connection.state === 'online';
  useEffect(() => {
    if (!active) return;
    return openLease(
      sensor.externalId,
      (expiration): void => {
        setExpiresAt(expiration);
        setError(null);
      },
      (reason): void => {
        setError(reason);
        setEnabled(false);
      },
    );
  }, [active, sensor.externalId]);
  return {
    enabled,
    active,
    expiresAt,
    error,
    toggle: (): void => {
      setEnabled(!enabled);
    },
  };
}
