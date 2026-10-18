import type { ReactNode } from 'react';
import { useState } from 'react';
import type { ProcessDetail } from '@smarteverything/domain';
import { Interactive } from '../../../components/interactive';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { View } from 'react-native';
import { clock, shortDate } from '../../../format/time';
import { InfoCard, InfoRow } from './info-rows';

function startedText(at: string): string {
  return `${shortDate(at)}, ${clock(at)}`;
}

function Details({ detail }: { readonly detail: ProcessDetail }): ReactNode {
  const [more, setMore] = useState(false);
  return (
    <>
      <Interactive
        label={more ? 'Hide details' : 'Show details'}
        expanded={more}
        onPress={() => {
          setMore(!more);
        }}
        className="min-h-row-h flex-row items-center gap-2 border-t border-outline-variant px-4"
      >
        <Icon name={more ? 'chevronDown' : 'chevronRight'} size={16} />
        <Text variant="body">{more ? 'Hide details' : 'Details'}</Text>
      </Interactive>
      {more ? (
        <View>
          <InfoRow label="Open files" value={String(detail.openFiles ?? '—')} first />
          <InfoRow label="Sockets" value={String(detail.sockets ?? '—')} />
          <InfoRow label="Process number" value={String(detail.pid)} />
        </View>
      ) : null}
    </>
  );
}

export function ProcessFacts({ detail }: { readonly detail: ProcessDetail }): ReactNode {
  return (
    <InfoCard>
      <InfoRow label="Command" value={detail.command} mono copy first />
      {detail.executable === null ? null : (
        <InfoRow label="Path" value={detail.executable} mono copy />
      )}
      <InfoRow label="Started" value={startedText(detail.startedAt)} />
      <InfoRow label="Parent" value={detail.parentName ?? 'The system'} />
      <InfoRow label="Children" value={String(detail.children.length)} />
      <InfoRow label="User" value={detail.user} />
      <InfoRow label="Threads" value={String(detail.threads)} />
      <Details detail={detail} />
    </InfoCard>
  );
}
