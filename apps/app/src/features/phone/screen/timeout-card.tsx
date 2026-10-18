import { useState, type ReactNode } from 'react';
import { PHONE_SCREEN_TIMEOUTS } from '@smarteverything/domain';
import { z } from 'zod';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Segmented } from '../../../components/segmented';
import type { Device } from '../../../store/state';
import { usePhoneRun } from '../data/phone-action';
import { NeedLine } from '../screens/detail-parts';
import { TIMEOUT_OPTIONS, foldText, timeoutValueOf, type ScreenSection } from './screen-model';

const TIMEOUT = z.coerce.number().pipe(z.union(PHONE_SCREEN_TIMEOUTS.map((s) => z.literal(s))));

interface Held {
  readonly from: number;
  readonly value: string;
}

function useTimeoutChange(
  device: Device,
  screen: ScreenSection,
): { readonly shown: string; readonly change: (value: string) => void } {
  const run = usePhoneRun(device);
  const [held, setHeld] = useState<Held | null>(null);
  const shown =
    held !== null && held.from === screen.timeoutSeconds
      ? held.value
      : timeoutValueOf(screen.timeoutSeconds);
  const change = (value: string): void => {
    setHeld({ from: screen.timeoutSeconds, value });
    run.mutate(
      {
        action: { type: 'set_timeout', seconds: TIMEOUT.parse(value) },
        failure: `${device.label} did not take that`,
      },
      {
        onSuccess: ({ ok }) => {
          if (!ok) setHeld(null);
        },
        onError: () => {
          setHeld(null);
        },
      },
    );
  };
  return { shown, change };
}

export function TimeoutCard({
  device,
  screen,
  canAct,
}: {
  readonly device: Device;
  readonly screen: ScreenSection;
  readonly canAct: boolean;
}): ReactNode {
  const { shown, change } = useTimeoutChange(device, screen);
  const fold = foldText(screen.fold);
  return (
    <Card
      title="Screen timeout"
      icon="timer"
      action={
        fold === null ? undefined : <Badge label={`Fold: ${fold.toLowerCase()}`} icon="maximize" />
      }
    >
      <Segmented
        label="Screen timeout"
        options={TIMEOUT_OPTIONS}
        value={shown}
        disabled={!canAct || !screen.writable}
        onChange={change}
      />
      {screen.writable ? null : (
        <NeedLine text="Allow Modify system settings on the phone to change the screen timeout here" />
      )}
    </Card>
  );
}
