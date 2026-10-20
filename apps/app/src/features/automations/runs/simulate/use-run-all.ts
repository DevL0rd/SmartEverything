import { useState } from 'react';
import type { AutomationTestsRunReply } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { notifyFailure } from '../../../../components/toast-store';
import { useRunActions } from '../../data/use-runs';

export interface RunAll {
  readonly reply: AutomationTestsRunReply | null;
  readonly running: boolean;
  readonly runAll: () => void;
}

export function useRunAll(automationId: string): RunAll {
  const actions = useRunActions();
  const [reply, setReply] = useState<AutomationTestsRunReply | null>(null);
  const [running, setRunning] = useState(false);
  return {
    reply,
    running,
    runAll: (): void => {
      setRunning(true);
      background(
        actions
          .runTests(automationId)
          .then(setReply)
          .catch(notifyFailure('The tests did not run.'))
          .finally(() => {
            setRunning(false);
          }),
        'automations.tests_run_all',
        { automationId },
      );
    },
  };
}
