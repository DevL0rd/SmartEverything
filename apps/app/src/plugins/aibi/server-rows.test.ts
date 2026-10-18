import { ROBOT_STATUS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { rowsOf } from '../../components/list-rows';
import { serverRows } from './server-rows';

const status = ROBOT_STATUS.parse({
  mode: 'local',
  address: '192.168.1.5',
  server: { state: 'running', reason: null },
  dns: { state: 'running', reason: null },
  ports: { http: 80, https: 443, dns: 53 },
  contact: null,
  calls: [],
  robot: null,
  conversation: false,
  waiting: 0,
  tasks: 0,
  configured: true,
  capture: false,
  lines: [],
  updatedAt: '2026-10-16T10:00:00Z',
});

describe('serverRows', () => {
  it('yields two separate rows so a list puts a hairline between them', () => {
    expect(rowsOf(serverRows(status))).toHaveLength(2);
  });
});
