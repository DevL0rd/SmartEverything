import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import { ActionRow } from '../../../components/rows';
import { clearWatchCaptures, useWatchCaptures } from '../../../api/developer';
import { bytes, count } from '../../../format/number';
import { WATCH_CAPTURES_KEY } from '../../../queries/keys';

function sizeText(files: number, total: number): string {
  return files === 0 ? 'Nothing saved.' : `${count(files)} files, ${bytes(total)} on the hub.`;
}

export function WatchCaptureClearRow(): ReactNode {
  const client = useQueryClient();
  const captures = useWatchCaptures();
  const subtitle = captures.data
    ? sizeText(captures.data.files, captures.data.bytes)
    : captures.isError
      ? 'Only a developer device can see the saved files.'
      : 'Reading the saved files.';
  return (
    <ActionRow
      title="Clear saved watch files"
      subtitle={subtitle}
      wrapSubtitle
      icon="trash"
      destructive
      onPress={() => {
        background(
          clearWatchCaptures().then(() =>
            client.invalidateQueries({ queryKey: WATCH_CAPTURES_KEY }),
          ),
          'developer.watch_captures_clear_failed',
        );
      }}
    />
  );
}
