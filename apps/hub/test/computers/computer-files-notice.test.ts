import {
  DEFAULT_COMPUTER_SCOPES,
  type ClientRow,
  type ComputerFilesChangedNotice,
  type ComputerLiveNotice,
  type HistoryPolicy,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { nodeDemandOf } from '../../src/computers/computer-demand';
import { deviceTarget, Viewers, type DeviceDetail } from '../../src/metrics/viewers';
import { LiveWatch, type WatchNotice } from '../../src/server/live-watch';
import { testLogger } from '../support/logs';
import { sessionRig } from '../support/session-rig';

const PC = '11111111-1111-4111-8111-111111111111';
const AT = '2026-10-17T10:00:00.000Z';
const HISTORY: HistoryPolicy = { window_ms: 3_600_000, interval_ms: 1_000 };
const CLIENT: ClientRow = {
  id: 'client-1',
  name: 'Phone',
  platform: 'android',
  kind: 'phone',
  role: 'member',
  built_in: false,
  profile_id: null,
  created_at: AT,
  last_seen_at: null,
};
const SCOPES = { processes: true, files: true };

function demandOf(
  ...holds: readonly (readonly [string, string, DeviceDetail?])[]
): ReturnType<Viewers<DeviceDetail>['demand']> {
  const viewers = new Viewers<DeviceDetail>();
  holds.forEach(([holder, topic, detail], index) => {
    viewers.hold(`${holder}${String(index)}`, [
      { target: deviceTarget(PC), topic, ...(detail === undefined ? {} : { detail }) },
    ]);
  });
  return viewers.demand(deviceTarget(PC));
}

describe('the files demand', () => {
  it('names every open folder once and leaves them out when no one has a folder open', () => {
    const demand = nodeDemandOf(
      demandOf(['a', 'files', '/home/sam'], ['b', 'files', '/home/sam'], ['c', 'files', '/tmp']),
      HISTORY,
      SCOPES,
    );
    expect(demand.topics.files).toBeGreaterThan(0);
    expect(demand.files).toEqual(['/home/sam', '/tmp']);
    expect(nodeDemandOf(demandOf(['a', 'cpu']), HISTORY, SCOPES).files).toBeUndefined();
  });

  it('is dropped while the files permission is off', () => {
    const demand = nodeDemandOf(demandOf(['a', 'files', '/home/sam']), HISTORY, {
      ...SCOPES,
      files: false,
    });
    expect(demand.topics.files).toBeUndefined();
    expect(demand.files).toBeUndefined();
  });

  it('reaches the computer as a demand frame when a viewer opens a folder', () => {
    const rig = sessionRig(PC);
    rig.viewers.hold('phone', [
      { target: deviceTarget(PC), topic: 'files', detail: '/home/sam/Pictures' },
    ]);
    const frame = rig.sent.findLast((sent) => sent.type === 'demand');
    expect(frame?.type === 'demand' ? frame.demand.files : null).toEqual(['/home/sam/Pictures']);
  });
});

describe('the files changed report', () => {
  const frame = { type: 'files_changed', path: '/home/sam' };

  it('becomes one notice for that computer', () => {
    const published: (ComputerLiveNotice | ComputerFilesChangedNotice)[] = [];
    const rig = sessionRig(PC, { publish: (notice) => published.push(notice) });
    rig.deliver(frame);
    expect(published).toEqual([
      { type: 'computer_files_changed', deviceId: PC, path: '/home/sam' },
    ]);
  });

  it('is dropped while the files permission is off', () => {
    const published: unknown[] = [];
    const rig = sessionRig(PC, {
      scopes: { ...DEFAULT_COMPUTER_SCOPES, files: false },
      publish: (notice) => published.push(notice),
    });
    rig.deliver(frame);
    expect(published).toEqual([]);
  });
});

describe('the files changed notice on the live socket', () => {
  it('reaches only a connection that holds the files topic of that computer', () => {
    const viewers = new Viewers<DeviceDetail>();
    const sent: [number, WatchNotice][] = [];
    const watch = new LiveWatch<{
      id: number;
      client: ClientRow;
      socket: { bufferedAmount: number };
    }>({
      send: (to, notice): void => {
        sent.push([to.id, notice]);
      },
      log: testLogger(),
    });
    watch.attach({ viewers, allowed: () => true, keyframe: () => null });
    const browsing = { id: 1, client: CLIENT, socket: { bufferedAmount: 0 } };
    const metering = { id: 2, client: CLIENT, socket: { bufferedAmount: 0 } };
    watch.receive(browsing, {
      type: 'watch',
      demands: [{ deviceId: PC, topics: ['files'], files: '/home/sam' }],
    });
    watch.receive(metering, { type: 'watch', demands: [{ deviceId: PC, topics: ['cpu'] }] });
    expect(viewers.demand(deviceTarget(PC)).details.get('files')).toEqual(['/home/sam']);
    const notice: ComputerFilesChangedNotice = {
      type: 'computer_files_changed',
      deviceId: PC,
      path: '/home/sam',
    };
    watch.publish(notice);
    watch.publish(notice);
    expect(sent).toEqual([
      [1, notice],
      [1, notice],
    ]);
  });
});
