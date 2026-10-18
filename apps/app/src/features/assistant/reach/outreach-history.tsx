import type { ReactNode } from 'react';
import type { AiOutreachRow } from '@smarteverything/domain';
import { LoadedQuery } from '../../../components/loaded-query';
import { ListRow } from '../../../components/list-row';
import { relative } from '../../../format/time';
import type { IconName } from '../../../components/icon-glyphs';
import { useMinute } from '../../../store/clock';
import { useOutreach } from './reach-data';

const HOW: Readonly<Record<AiOutreachRow['how'], { label: string; icon: IconName }>> = {
  phone: { label: 'Called your phone', icon: 'phone' },
  desktop: { label: 'Called your computer', icon: 'phone' },
  app: { label: 'Called your apps', icon: 'phone' },
  camera: { label: 'Talked through', icon: 'cameras' },
  channel: { label: 'Talked on', icon: 'radio' },
  message: { label: 'Messaged', icon: 'messageCircle' },
};

const STATE: Readonly<Record<AiOutreachRow['state'], string>> = {
  ringing: 'Ringing',
  live: 'Talking',
  ended: 'Ended',
  missed: 'Missed',
  declined: 'Declined',
  failed: 'Failed',
  sent: 'Done',
};

function titleOf(row: AiOutreachRow): string {
  if (row.chat_id === null && row.how !== 'message') {
    return `Said on ${row.target_label}`;
  }
  const how = HOW[row.how];
  return row.how === 'camera' || row.how === 'channel'
    ? `${how.label} ${row.target_label}`
    : how.label;
}

export function OutreachHistory(): ReactNode {
  const outreach = useOutreach();
  const now = useMinute();
  return (
    <LoadedQuery query={outreach}>
      {(rows) =>
        rows.length === 0 ? (
          <ListRow title="Nothing yet" subtitle="Calls and messages the AI starts show here" />
        ) : (
          rows.map((row) => (
            <ListRow
              key={row.id}
              title={titleOf(row)}
              subtitle={row.reason}
              icon={HOW[row.how].icon}
              value={`${STATE[row.state]} · ${relative(row.created_at, now)}`}
            />
          ))
        )
      }
    </LoadedQuery>
  );
}
