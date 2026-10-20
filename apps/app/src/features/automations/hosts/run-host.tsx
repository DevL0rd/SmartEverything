import type { ReactNode } from 'react';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import type { AutomationRunSummary } from '@smarteverything/domain';
import { background, Logger } from '@smarteverything/logging';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { notify } from '../../../components/toast-store';
import { useAutomations } from '../data/use-automations';
import { useRunActions } from '../data/use-runs';
import { RunScreen } from '../runs/run-view/run-screen';
import { links } from '../routes';
import { runHref, runPageTitle } from './host-links';
import { useEditorContext } from './editor-context';
import { NotFound } from './page-shell';
import { usePlace } from './use-environment';

const log = new Logger('app.automations');

const PARAMS = z.object({ automationId: z.string(), runId: z.string() });

function useReplay(): (run: AutomationRunSummary) => void {
  const router = useRouter();
  const actions = useRunActions();
  return (run) => {
    background(
      actions
        .start({ automationId: run.automation_id, mode: 'dry' })
        .then((reply) => {
          if (reply.run === null) notify({ message: reply.summary, tone: 'critical' });
          else router.replace(runHref(reply.run));
        })
        .catch((error: unknown) => {
          log.error('automations.replay_failed', error);
          notify({ message: 'The test run didn’t start', tone: 'critical', error });
        }),
      'automations.replay',
    );
  };
}

function Run({
  automationId,
  runId,
}: {
  readonly automationId: string;
  readonly runId: string;
}): ReactNode {
  const router = useRouter();
  const { options } = useEditorContext();
  const { timeZone } = usePlace();
  const onReplay = useReplay();
  const name = useAutomations().byId.get(automationId)?.name ?? null;
  return (
    <Screen header={<PageHeader title={runPageTitle(name)} back />} maxWidth="full" scroll={false}>
      <RunScreen
        runId={runId}
        options={options}
        zone={timeZone}
        onScreen={useIsFocused()}
        onReplay={onReplay}
        onOpenEditor={(run, nodeId) => {
          router.push(
            links.edit(run.automation_id, nodeId === null ? undefined : `node:${nodeId}`),
          );
        }}
      />
    </Screen>
  );
}

export function RunHost(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  return params.success ? (
    <Run automationId={params.data.automationId} runId={params.data.runId} />
  ) : (
    <NotFound title="Run not found" body="This link doesn’t point to a run." />
  );
}
