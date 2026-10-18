import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { RankedList } from '../../../components/ranked-list';
import { Section, SectionAction } from '../../../components/section';
import { sameJson } from '../../../store/same-json';
import { DemandRegion } from '../../../store/demand-region';
import { useComputerSelect } from '../data/computer-metrics';
import { TOP_WINDOW, topEntries } from '../model/top-processes';

const TOPICS = ['processes'] as const;

export function TopProcesses({ deviceId }: { readonly deviceId: string }): ReactNode {
  const router = useRouter();
  const rows = useComputerSelect(deviceId, (parts) => parts.processes?.rows, sameJson);
  const target = href.settings.device(deviceId, 'processes');
  return (
    <DemandRegion deviceId={deviceId} topics={TOPICS} window={TOP_WINDOW}>
      {rows === undefined ? null : (
        <Section title="Top processes" action={<SectionAction label="See all" href={target} />}>
          <RankedList
            entries={topEntries(rows)}
            onPress={() => {
              router.push(target);
            }}
          />
        </Section>
      )}
    </DemandRegion>
  );
}
