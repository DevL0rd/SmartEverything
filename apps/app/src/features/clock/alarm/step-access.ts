import { Logger, background } from '@smarteverything/logging';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  plannerLinked,
  requestStepCounterPermission,
  stepCounterAvailable,
  stepCounterPermitted,
} from '../../../../modules/health-connect';

const log = new Logger('app.clock');

export type StepAccess = 'checking' | 'elsewhere' | 'unavailable' | 'needed' | 'allowed';

export interface StepAccessState {
  readonly access: StepAccess;
  readonly ask: () => void;
}

function onThisPhone(): boolean {
  return Platform.OS === 'android' && plannerLinked();
}

async function accessNow(): Promise<StepAccess> {
  if (!(await stepCounterAvailable())) return 'unavailable';
  return (await stepCounterPermitted()) ? 'allowed' : 'needed';
}

export function useStepAccess(wanted: boolean): StepAccessState {
  const local = onThisPhone();
  const [access, setAccess] = useState<StepAccess>(local ? 'checking' : 'elsewhere');
  useEffect(() => {
    if (!wanted || !local) return;
    background(accessNow().then(setAccess), 'clock.step_access_failed');
  }, [wanted, local]);
  return {
    access,
    ask: (): void => {
      log.info('alarm.step_access_asked');
      background(
        requestStepCounterPermission().then((granted) => {
          setAccess(granted ? 'allowed' : 'needed');
        }),
        'clock.step_access_failed',
      );
    },
  };
}
