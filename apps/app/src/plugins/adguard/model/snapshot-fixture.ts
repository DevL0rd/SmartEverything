import type { AdGuardSnapshot, AdGuardStats, AdGuardStatus } from '@smarteverything/domain';

const HOURS = 24;

export const statsFixture = (patch: Partial<AdGuardStats> = {}): AdGuardStats => ({
  queries: 30_604,
  blocked: 6_420,
  blockedPercent: 18.4,
  averageMs: 14.2,
  malware: 12,
  adult: 3,
  topQueried: [
    { name: 'api.smarteverything.home', count: 4_100 },
    { name: 'time.cloudflare.com', count: 1_025 },
  ],
  topBlocked: [
    { name: 'doubleclick.net', count: 1_900 },
    { name: 'ads.tiktok.com', count: 950 },
  ],
  topClients: [{ name: 'Living room TV', count: 9_000 }],
  history: Array.from({ length: HOURS }, (_, index) => 1_000 + index * 10),
  historyBlocked: Array.from({ length: HOURS }, (_, index) => 100 + index),
  timeUnit: 'hours',
  ...patch,
});

export const statusFixture = (patch: Partial<AdGuardStatus> = {}): AdGuardStatus => ({
  version: 'v0.107.55',
  running: true,
  protection: true,
  pausedUntil: null,
  ...patch,
});

export const snapshotFixture = (patch: Partial<AdGuardSnapshot> = {}): AdGuardSnapshot => ({
  at: '2026-10-17T13:30:00.000Z',
  url: 'http://192.168.50.2:3000',
  connection: { state: 'online' },
  cadence: 'fast',
  intervalSeconds: 10,
  status: statusFixture(),
  stats: statsFixture(),
  filters: [],
  userRules: [],
  ...patch,
});
