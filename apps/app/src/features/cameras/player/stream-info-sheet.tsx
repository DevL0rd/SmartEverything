import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { percent } from '../../../format/number';
import type { LiveSession } from './use-live-session';
import {
  STATS_EVERY_MS,
  bitrateText,
  resolutionText,
  sampleOf,
  statsBetween,
  type StreamSample,
  type StreamStats,
} from './stats';

function useSampledStats(live: LiveSession, open: boolean): StreamStats | null {
  const [stats, setStats] = useState<StreamStats | null>(null);
  const { stats: read } = live.session;
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    let previous: StreamSample | null = null;
    const sample = (): void => {
      read().then(
        (report) => {
          const current = sampleOf(report);
          if (current !== null) {
            setStats(statsBetween(previous, current));
            previous = current;
          }
        },
        () => {
          setStats(null);
        },
      );
    };
    sample();
    const timer = setInterval(sample, STATS_EVERY_MS);
    return (): void => {
      clearInterval(timer);
    };
  }, [open, read]);
  return open ? stats : null;
}

export interface StreamInfoSheetProps {
  readonly live: LiveSession;
  readonly open: boolean;
  readonly onClose: () => void;
}

const UNKNOWN = 'Not reported';

function written(value: number | null | undefined, write: (value: number) => string): string {
  return value === null || value === undefined ? UNKNOWN : write(value);
}

export function StreamInfoSheet({ live, open, onClose }: StreamInfoSheetProps): ReactNode {
  const stats = useSampledStats(live, open);
  return (
    <Sheet open={open} onClose={onClose} title="Stream info" detents={['fit']}>
      <List inset>
        <ValueRow title="Connection" value={live.relay ? 'Through your server' : 'Direct'} />
        <ValueRow
          title="Picture"
          value={stats === null ? UNKNOWN : (resolutionText(stats) ?? UNKNOWN)}
        />
        <ValueRow title="Bitrate" value={written(stats?.kbps, bitrateText)} />
        <ValueRow
          title="Frame rate"
          value={written(stats?.fps, (fps) => `${String(Math.round(fps))} fps`)}
        />
        <ValueRow
          title="Packets lost"
          value={written(stats?.lossPercent, (loss) => percent(loss / 100, 1))}
        />
      </List>
      <Text variant="footnote" tone="variant" className="px-4 pt-2">
        Updates every few seconds while this is open.
      </Text>
    </Sheet>
  );
}
