import { useState, type ReactNode } from 'react';
import { Sheet } from '../../../../components/sheet';
import type { VersionRow } from '../../detail/detail-model';
import { Versions } from '../../detail/versions';

export interface VersionsSheetProps {
  readonly open: boolean;
  readonly automationId: string;
  readonly versions: readonly VersionRow[];
  readonly live: number;
  readonly timeZone: string | null;
  readonly onRestore: (revision: number) => void;
  readonly onClose: () => void;
}

export function VersionsSheet({
  open,
  automationId,
  versions,
  live,
  timeZone,
  onRestore,
  onClose,
}: VersionsSheetProps): ReactNode {
  const [showAll, setShowAll] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Versions">
      <Versions
        automationId={automationId}
        versions={versions}
        live={live}
        timeZone={timeZone}
        showAll={showAll}
        onShowAll={setShowAll}
        onRestore={(revision) => {
          onRestore(revision);
          onClose();
        }}
      />
    </Sheet>
  );
}
