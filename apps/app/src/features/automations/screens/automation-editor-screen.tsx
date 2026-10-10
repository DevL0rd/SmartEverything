import type { ReactNode } from 'react';
import { useState } from 'react';
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

const PARAMS = z.object({ automationId: z.string(), idea: z.string().optional() });

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
    return { kind: 'ready', draft: idea?.draft ?? EMPTY_DRAFT, savedId: null };
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

function Unreadable({ row }: { readonly row: AutomationRow }): ReactNode {
  const router = useRouter();
  return (
    <NotFound
      title={`${row.name} can’t be opened`}
      body="It was saved in a form this app can’t read. Delete it and make it again."
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

function OpenedEditor({ params }: { readonly params: z.infer<typeof PARAMS> }): ReactNode {
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
          catalog={catalog}
          takenNames={rows.map((row) => row.name)}
        />
      );
  }
}

export function AutomationEditorScreen(): ReactNode {
  useHideNavigation();
  const params = PARAMS.safeParse(useLocalSearchParams());
  return params.success ? (
    <OpenedEditor params={params.data} />
  ) : (
    <NotFound title="Automation not found" body="This link doesn’t point to an automation." />
  );
}
