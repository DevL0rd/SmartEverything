import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import { href } from '../../../app-shell/hrefs';
import { useHideNavigation } from '../../../app-shell/nav-visibility';
import type { AutomationRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { useRows } from '../../../store/selectors';
import { removeAutomation } from '../data/actions';
import { useCatalog } from '../data/use-automations';
import { AutomationEditor } from '../editor/automation-editor';
import { ProgramLibraryProvider } from '../editor/program-library';
import { NotFound } from './not-found';
import { EMPTY_DRAFT, readDraft, type Draft } from '../model/editor-state';
import { isReusable, storedAutomationOf } from '../model/reusable-steps';
import { templatesFor } from '../model/templates';

const PARAMS = z.object({
  automationId: z.string(),
  idea: z.string().optional(),
  reload: z.string().optional(),
});

type Opening =
  | {
      readonly kind: 'ready';
      readonly draft: Draft;
      readonly savedId: string | null;
      readonly revision: number | null;
    }
  | { readonly kind: 'missing' }
  | { readonly kind: 'reusable'; readonly id: string }
  | { readonly kind: 'unreadable'; readonly row: AutomationRow; readonly problem: string };

function openingOf(
  params: z.infer<typeof PARAMS>,
  rows: readonly AutomationRow[],
  devices: Parameters<typeof templatesFor>[0],
): Opening {
  if (params.automationId === 'new') {
    const idea = templatesFor(devices).find((template) => template.id === params.idea);
    return { kind: 'ready', draft: idea?.draft ?? EMPTY_DRAFT, savedId: null, revision: null };
  }
  const row = rows.find((candidate) => candidate.id === params.automationId);
  if (row === undefined) {
    return { kind: 'missing' };
  }
  const stored = storedAutomationOf(row);
  if (stored !== null && isReusable(stored)) {
    return { kind: 'reusable', id: row.id };
  }
  const read = readDraft(row);
  return read.readable
    ? { kind: 'ready', draft: read.draft, savedId: row.id, revision: row.revision }
    : { kind: 'unreadable', row, problem: read.problem };
}

interface UnreadableProps {
  readonly row: AutomationRow;
  readonly problem: string;
}

function Unreadable({ row, problem }: UnreadableProps): ReactNode {
  const router = useRouter();
  return (
    <NotFound
      title={`${row.name} can’t be opened`}
      body={`It keeps running as saved. ${problem}.`}
      action={
        <View className="flex-row gap-3">
          <Button
            label="Delete"
            variant="destructive"
            onPress={() => {
              removeAutomation(row.id);
              router.back();
            }}
          />
        </View>
      }
    />
  );
}

interface OpenedEditorProps {
  readonly params: z.infer<typeof PARAMS>;
}

function OpenedEditor({ params }: OpenedEditorProps): ReactNode {
  const rows = useRows('automations');
  const catalog = useCatalog();
  const [opening] = useState(() => openingOf(params, rows, catalog.devices));
  switch (opening.kind) {
    case 'missing':
      return (
        <NotFound
          title="This automation is gone"
          body="It may have been deleted on another device."
        />
      );
    case 'reusable':
      return <Redirect href={href.automationSequence(opening.id)} />;
    case 'unreadable':
      return <Unreadable row={opening.row} problem={opening.problem} />;
    case 'ready':
      return (
        <ProgramLibraryProvider>
          <AutomationEditor
            start={opening.draft}
            savedId={opening.savedId}
            revision={opening.revision}
            reusable={false}
            catalog={catalog}
            takenNames={rows.map((row) => row.name)}
          />
        </ProgramLibraryProvider>
      );
  }
}

export function AutomationEditorScreen(): ReactNode {
  useHideNavigation();
  const params = PARAMS.safeParse(useLocalSearchParams());
  const [openedId] = useState(params.success ? params.data.automationId : null);
  return params.success ? (
    <OpenedEditor
      key={`${openedId ?? params.data.automationId}:${params.data.reload ?? ''}`}
      params={params.data}
    />
  ) : (
    <NotFound title="Automation not found" body="This link doesn’t point to an automation." />
  );
}
