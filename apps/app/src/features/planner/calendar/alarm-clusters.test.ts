import { clockFormatOf } from '../../../format/clock-text';
import { describe, expect, it } from 'vitest';
import {
  alarmClustersOf,
  clusterLabel,
  clusterText,
  laneInsetOf,
  pillBandOf,
} from './alarm-clusters';
import type { AlarmPin } from './time-grid-layout';

function pin(minute: number, label: string | null = null): AlarmPin {
  const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  return {
    key: `a${String(minute)}`,
    alarmId: `a${String(minute)}`,
    date: '2026-11-14',
    minute,
    time,
    label,
  };
}

const H24 = clockFormatOf(true);
const H12 = clockFormatOf(false);

describe('alarm clusters', () => {
  it('keeps pins apart when their pills fit between them', () => {
    const clusters = alarmClustersOf([pin(360), pin(420)], 44);
    expect(clusters.map((cluster) => cluster.pins.length)).toEqual([1, 1]);
  });

  it('joins pins whose pills would overlap at this hour height', () => {
    const clusters = alarmClustersOf([pin(405), pin(375), pin(390), pin(480)], 44);
    expect(clusters.map((cluster) => cluster.pins.map((each) => each.minute))).toEqual([
      [375, 390, 405],
      [480],
    ]);
  });

  it('separates the same pins when the hours are tall', () => {
    expect(alarmClustersOf([pin(375), pin(390)], 160)).toHaveLength(2);
  });

  it('names one alarm by its time and label and a group by its first time and count', () => {
    const [one] = alarmClustersOf([pin(375, 'Run')], 44);
    const [many] = alarmClustersOf([pin(375, 'Run'), pin(390), pin(405)], 44);
    if (one === undefined || many === undefined) throw new Error('no cluster');
    expect(clusterText(one, false, H24)).toBe('06:15 Run');
    expect(clusterText(one, true, H24)).toBe('06:15');
    expect(clusterText(many, false, H24)).toBe('06:15 +2 more');
    expect(clusterText(many, true, H24)).toBe('06:15 +2');
    expect(clusterLabel(many, H24)).toBe('Alarms 06:15 Run, 06:30, 06:45, opens Clock');
    expect(clusterText(one, false, H12)).toBe(`${H12.text('06:15')} Run`);
    expect(clusterLabel(many, H12)).toMatch(
      /^Alarms 6:15\s\S+ Run, 6:30\s\S+, 6:45\s\S+, opens Clock$/u,
    );
  });

  it('moves only the blocks that share a pill band out of its lane', () => {
    const [cluster] = alarmClustersOf([pin(420)], 44);
    if (cluster === undefined) throw new Error('no cluster');
    const band = pillBandOf(cluster, 44, 20);
    expect(band).toEqual({ top: 286, bottom: 306, right: 24 });
    expect(laneInsetOf({ top: 270, bottom: 300, left: 0, width: 100 }, [band])).toBe(24);
    expect(laneInsetOf({ top: 270, bottom: 300, left: 10, width: 100 }, [band])).toBe(14);
    expect(laneInsetOf({ top: 310, bottom: 340, left: 0, width: 100 }, [band])).toBe(0);
    expect(laneInsetOf({ top: 270, bottom: 300, left: 40, width: 100 }, [band])).toBe(0);
    expect(laneInsetOf({ top: 270, bottom: 300, left: 0, width: 60 }, [band])).toBe(0);
  });
});
