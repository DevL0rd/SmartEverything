import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { useRow } from '../../../store/selectors';
import { OwnedRuns } from '../components/owned-runs';
import { EditorFocusProvider } from '../editor/editor-focus';
import { FocusedRun } from '../editor/focused-run';
import { NotFound } from './not-found';

interface RunsPageProps {
  readonly title: string;
  readonly automationId: string | null;
}

function RunsPage({ title, automationId }: RunsPageProps): ReactNode {
  return (
    <EditorFocusProvider>
      <Screen maxWidth="reading" header={<PageHeader title={title} />}>
        <FocusedRun />
        <OwnedRuns automationId={automationId} />
      </Screen>
    </EditorFocusProvider>
  );
}

const PARAMS = z.object({ automationId: z.string() });

function OneAutomationRuns({ automationId }: { readonly automationId: string }): ReactNode {
  const row = useRow('automations', automationId);
  return (
    <RunsPage
      title={row === null ? 'Run history' : `${row.name} runs`}
      automationId={automationId}
    />
  );
}

export function AutomationRunsScreen(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  return params.success ? (
    <OneAutomationRuns automationId={params.data.automationId} />
  ) : (
    <NotFound title="Automation not found" body="This link doesn’t point to an automation." />
  );
}

export function AllRunsScreen(): ReactNode {
  return <RunsPage title="Run history" automationId={null} />;
}
