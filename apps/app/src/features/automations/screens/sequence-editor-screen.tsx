import type { ReactNode } from 'react';
import { useState } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { href } from '../../../app-shell/hrefs';
import { useRows } from '../../../store/selectors';
import { ProgramLibraryProvider } from '../editor/program-library';
import { ReusableEditor } from '../editor/reusable-editor';
import { isReusable, storedAutomationOf } from '../model/reusable-steps';
import { NotFound } from './not-found';

const PARAMS = z.object({ sequenceId: z.string(), reload: z.string().optional() });

function OpenedReusable({ sequenceId }: { readonly sequenceId: string }): ReactNode {
  const rows = useRows('automations');
  const row = sequenceId === 'new' ? null : (rows.find((entry) => entry.id === sequenceId) ?? null);
  if (sequenceId !== 'new' && row === null)
    return (
      <NotFound title="These steps are gone" body="They may have been deleted on another device." />
    );
  const automation = row === null ? null : storedAutomationOf(row);
  if (row !== null && automation !== null && !isReusable(automation))
    return <Redirect href={href.automation(row.id)} />;
  return <ReusableEditor row={row} />;
}

export function SequenceEditorScreen(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  const [openedId] = useState(params.success ? params.data.sequenceId : null);
  if (!params.success)
    return <NotFound title="Not found" body="This link doesn’t point to reusable steps." />;
  return (
    <ProgramLibraryProvider>
      <OpenedReusable
        key={`${openedId ?? params.data.sequenceId}:${params.data.reload ?? ''}`}
        sequenceId={params.data.sequenceId}
      />
    </ProgramLibraryProvider>
  );
}
