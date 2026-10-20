import { useMemo, type ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import type { AutomationRunSummary } from '@smarteverything/domain';
import { useProfiles } from '../../../store/people';
import { useAutomation } from '../data/use-automation';
import { DetailScreen, type DetailEnvironment } from '../detail/detail-screen';
import { RunsScreen } from '../runs/runs-screen';
import { detailLinks, runHref } from './host-links';
import { NotFound, PageShell } from './page-shell';
import { useFunctionLookup, useLintContext, usePlace, useRefNames } from './use-environment';

const PARAMS = z.object({ automationId: z.string() });

function useOpenRun(): (run: AutomationRunSummary) => void {
  const router = useRouter();
  return (run) => {
    router.push(runHref(run));
  };
}

function useDetailEnvironment(): DetailEnvironment {
  const names = useRefNames();
  const functions = useFunctionLookup();
  const lint = useLintContext();
  const { timeZone } = usePlace();
  const people = useProfiles();
  return useMemo(
    () => ({
      names,
      functions,
      lint,
      timeZone,
      person: (profileId) => people.find((person) => person.id === profileId)?.name ?? null,
    }),
    [names, functions, lint, timeZone, people],
  );
}

function Detail({ automationId }: { readonly automationId: string }): ReactNode {
  const { row } = useAutomation(automationId);
  const environment = useDetailEnvironment();
  const onOpenRun = useOpenRun();
  return (
    <PageShell title={row?.name ?? 'Automation'}>
      <DetailScreen
        automationId={automationId}
        environment={environment}
        links={detailLinks(automationId)}
        onOpenRun={onOpenRun}
      />
    </PageShell>
  );
}

export function DetailHost(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  return params.success ? (
    <Detail automationId={params.data.automationId} />
  ) : (
    <NotFound title="Automation not found" body="This link doesn’t point to an automation." />
  );
}

function Runs({ automationId }: { readonly automationId: string | null }): ReactNode {
  const { row } = useAutomation(automationId ?? '');
  const { timeZone } = usePlace();
  const onOpenRun = useOpenRun();
  const title = automationId === null ? 'Run history' : row === null ? 'Runs' : `${row.name} runs`;
  return (
    <PageShell title={title}>
      <RunsScreen automationId={automationId} timeZone={timeZone} onOpenRun={onOpenRun} />
    </PageShell>
  );
}

export function AutomationRunsHost(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  return params.success ? (
    <Runs automationId={params.data.automationId} />
  ) : (
    <NotFound title="Automation not found" body="This link doesn’t point to an automation." />
  );
}

export function AllRunsHost(): ReactNode {
  return <Runs automationId={null} />;
}
