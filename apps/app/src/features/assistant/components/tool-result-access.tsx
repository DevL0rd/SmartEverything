import { useMemo, useState, type ReactNode } from 'react';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { RecordedDiffSource } from '../model/diff-source';
import { RecordedDiffSourceSheet } from './recorded-diff-source';

export function ToolResultAccess({
  output,
  title,
}: {
  readonly output: string | null;
  readonly title: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const sources = useMemo<readonly RecordedDiffSource[]>(
    () => (output === null ? [] : [{ label: 'Result', text: output }]),
    [output],
  );
  if (output === null) return null;
  return (
    <>
      <Interactive
        label="Open tool result"
        onPress={() => {
          setOpen(true);
        }}
        className="min-h-touch-min justify-center self-start pl-6"
      >
        <Text variant="caption" tone="primary">
          Tool result
        </Text>
      </Interactive>
      {open ? (
        <RecordedDiffSourceSheet
          title="Tool result"
          path={title}
          sources={sources}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
