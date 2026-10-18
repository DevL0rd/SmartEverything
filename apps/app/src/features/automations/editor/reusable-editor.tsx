import type { ReactNode } from 'react';
import { useState } from 'react';
import type { AutomationRow } from '@smarteverything/domain';
import { useCatalog } from '../data/use-automations';
import { EMPTY_DRAFT, readDraft, type ReadDraft } from '../model/editor-state';
import { NotFound } from '../screens/not-found';
import { AutomationEditor } from './automation-editor';

export function ReusableEditor({ row }: { readonly row: AutomationRow | null }): ReactNode {
  const catalog = useCatalog();
  const [opening] = useState((): ReadDraft =>
    row === null ? { readable: true, draft: EMPTY_DRAFT } : readDraft(row),
  );
  if (!opening.readable) return <NotFound title="This can’t be opened" body={opening.problem} />;
  return (
    <AutomationEditor
      start={opening.draft}
      savedId={row?.id ?? null}
      revision={row?.revision ?? null}
      reusable
      catalog={catalog}
      takenNames={catalog.automations.map((entry) => entry.name)}
    />
  );
}
