import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useCameraEntries } from '../data/use-cameras';
import { useTranscriptStatus } from '../data/use-transcripts';
import { listeningDetail, listeningLabel } from './transcript-model';

export function ListeningRows(): ReactNode {
  const entries = useCameraEntries();
  const status = useTranscriptStatus();
  if (entries.length === 0) {
    return null;
  }
  return (
    <List
      title="What cameras hear"
      footer="A camera writes what it hears as text only when you turn it on in its options. The sound itself is never kept, and only you can read the text."
    >
      {entries.map((entry) => {
        const listening = status.data?.cameras.find(
          (camera) => camera.camera_id === entry.device.id,
        );
        const detail = listening === undefined ? null : listeningDetail(listening);
        return (
          <NavRow
            key={entry.device.id}
            title={entry.name}
            icon="mic"
            value={listening === undefined ? '' : listeningLabel(listening)}
            {...(detail === null ? {} : { subtitle: detail })}
            href={href.settings.camera(entry.device.id)}
          />
        );
      })}
    </List>
  );
}
