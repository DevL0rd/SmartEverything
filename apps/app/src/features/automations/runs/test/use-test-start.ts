import { useState } from 'react';
import type { AutomationRunStartReply } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { notifyFailure } from '../../../../components/toast-store';
import type { RunStartBody } from '../../data/api';
import { useRunActions } from '../../data/use-runs';

export interface TestStart {
  readonly starting: 'dry' | 'live' | null;
  readonly start: (body: RunStartBody) => Promise<void>;
  readonly startTest: (body: RunStartBody) => void;
}

async function startRun(
  begin: (body: RunStartBody) => Promise<AutomationRunStartReply>,
  onStarted: (reply: AutomationRunStartReply) => void,
  setStarting: (starting: TestStart['starting']) => void,
  body: RunStartBody,
): Promise<void> {
  setStarting(body.mode === 'live' ? 'live' : 'dry');
  try {
    onStarted(await begin(body));
  } finally {
    setStarting(null);
  }
}

export function useTestStart(onStarted: (reply: AutomationRunStartReply) => void): TestStart {
  const actions = useRunActions();
  const [starting, setStarting] = useState<TestStart['starting']>(null);
  const start = (body: RunStartBody): Promise<void> =>
    startRun(actions.start, onStarted, setStarting, body);
  return {
    starting,
    start,
    startTest: (body): void => {
      background(
        start(body).catch(notifyFailure('The test did not start.')),
        'automations.test_start',
        {
          automationId: body.automationId,
        },
      );
    },
  };
}
