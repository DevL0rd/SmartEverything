import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComputerOutages } from '../../src/server/computer-outages';
import { captureLogs, type CapturedLogs } from '../support/logs';

const COMPUTER = 'fda22089-7faa-4b09-b39c-6281a9ebaeca';

let logs: CapturedLogs;
let clock: number;
let outages: ComputerOutages;

beforeEach(() => {
  logs = captureLogs();
  clock = 1000;
  outages = new ComputerOutages(new Logger('hub.computers'), () => clock);
});

afterEach(() => {
  Logger.reset();
});

describe('computer outages', () => {
  it('says once why a computer went offline', () => {
    outages.lost(COMPUTER, 'hub:heartbeat_missed');
    outages.lost(COMPUTER, 'computer_or_network');
    const lines = logs.records.filter((record) => record.event === 'computer.offline');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe('warn');
    expect(lines[0]?.payload).toEqual({ deviceId: COMPUTER, reason: 'hub:heartbeat_missed' });
  });

  it('says how long a computer was offline and why when it comes back', () => {
    outages.lost(COMPUTER, 'hub:heartbeat_missed');
    clock += 36_000_000;
    outages.returned(COMPUTER);
    const back = logs.records.find((record) => record.event === 'computer.back_online');
    expect(back?.payload).toEqual({
      deviceId: COMPUTER,
      reason: 'hub:heartbeat_missed',
      offlineMs: 36_000_000,
    });
  });

  it('says nothing when a computer that was never lost connects', () => {
    outages.returned(COMPUTER);
    expect(logs.events()).toEqual([]);
  });

  it('starts a new outage after the computer came back', () => {
    outages.lost(COMPUTER, 'hub:heartbeat_missed');
    outages.returned(COMPUTER);
    outages.returned(COMPUTER);
    outages.lost(COMPUTER, 'computer_or_network');
    expect(logs.events()).toEqual(['computer.offline', 'computer.back_online', 'computer.offline']);
  });
});
