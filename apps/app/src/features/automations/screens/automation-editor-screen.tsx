import type { ReactNode } from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readAutomationRevision } from '../../../api/automation-runtime';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { Screen } from '../../../components/screen';
import { PageHeader } from '../../../components/page-header';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import { useHideNavigation } from '../../../app-shell/nav-visibility';
import type { AutomationRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { useRows } from '../../../store/selectors';
import { removeAutomation } from '../data/actions';
import { useCatalog, type Catalog } from '../data/use-automations';
import { AutomationEditor } from '../editor/automation-editor';
import { NotFound } from './not-found';
import { EMPTY_DRAFT, readDraft, type Draft } from '../model/editor-state';
import { templatesFor } from '../model/templates';

const PARAMS = z.object({
  automationId: z.string(),
  idea: z.string().optional(),
  reload: z.string().optional(),
});

type Opening =
  | { readonly kind: 'ready'; readonly draft: Draft; readonly savedId: string | null }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unreadable'; readonly row: AutomationRow };

function openingOf(
  params: z.infer<typeof PARAMS>,
  rows: readonly AutomationRow[],
  catalog: Catalog,
): Opening {
  if (params.automationId === 'new') {
    const idea = templatesFor(catalog.devices).find((template) => template.id === params.idea);
    const draft = idea?.draft ?? EMPTY_DRAFT;
    return {
      kind: 'ready',
      draft: { ...draft, runPolicy: draft.runPolicy ?? { mode: 'single' } },
      savedId: null,
    };
  }
  const row = rows.find((candidate) => candidate.id === params.automationId);
  if (row === undefined) {
    return { kind: 'missing' };
  }
  const read = readDraft(row);
  return read.readable
    ? { kind: 'ready', draft: read.draft, savedId: row.id }
    : { kind: 'unreadable', row };
}

interface UnreadableProps {
  readonly row: AutomationRow;
}

function Unreadable({ row }: UnreadableProps): ReactNode {
  const router = useRouter();
  return (
    <NotFound
      title={`${row.name} can’t be opened`}
      body="Its saved program is preserved. Open it with a compatible app version to edit it."
      action={
        <View className="flex-row gap-3">
          <Button
            label="Delete"
            variant="destructive"
            onPress={() => {
              void removeAutomation(row.id, null).then((removed) => {
                if (removed) {
                  router.back();
                }
              });
            }}
          />
        </View>
      }
    />
  );
}

interface NewEditorProps {
  readonly params: z.infer<typeof PARAMS>;
}

function NewEditor({ params }: NewEditorProps): ReactNode {
  const rows = useRows('automations');
  const catalog = useCatalog();
  const [opening] = useState(() => openingOf(params, rows, catalog));
  switch (opening.kind) {
    case 'missing':
      return (
        <NotFound
          title="This automation is gone"
          body="It may have been deleted on another device."
        />
      );
    case 'unreadable':
      return <Unreadable row={opening.row} />;
    case 'ready':
      return (
        <AutomationEditor
          start={opening.draft}
          savedId={opening.savedId}
          revision={null}
          catalog={catalog}
          takenNames={rows.map((row) => row.name)}
        />
      );
  }
}

interface SavedEditorProps {
  readonly id: string;
  readonly reload: string | undefined;
}

function SavedEditor({ id, reload }: SavedEditorProps): ReactNode {
  const catalog = useCatalog();
  const rows = useRows('automations');
  const source = useQuery({
    queryKey: ['automation-editor-revision', id, reload],
    queryFn: () => readAutomationRevision(id),
    staleTime: 0,
    retry: false,
  });
  if (source.isPending)
    return (
      <Screen header={<PageHeader title="Automation" />}>
        <Skeleton shape="block" className="h-40" />
      </Screen>
    );
  if (source.error !== null)
    return (
      <Screen header={<PageHeader title="Automation" />}>
        <ErrorState
          error={source.error}
          retry={() => {
            void source.refetch();
          }}
        />
      </Screen>
    );
  const read = readDraft(source.data.automation);
  return read.readable ? (
    <AutomationEditor
      key={`${id}:${reload ?? ''}`}
      start={read.draft}
      savedId={id}
      revision={source.data.definitionRevision}
      catalog={catalog}
      takenNames={rows.map((row) => row.name)}
    />
  ) : (
    <Unreadable row={source.data.automation} />
  );
}

export function AutomationEditorScreen(): ReactNode {
  useHideNavigation();
  const params = PARAMS.safeParse(useLocalSearchParams());
  const [newAtOpen] = useState(params.success && params.data.automationId === 'new');
  return params.success ? (
    newAtOpen ? (
      <NewEditor params={params.data} />
    ) : (
      <SavedEditor id={params.data.automationId} reload={params.data.reload} />
    )
  ) : (
    <NotFound title="Automation not found" body="This link doesn’t point to an automation." />
  );
}
