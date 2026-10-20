import type { EventRow, RecordingRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  cameraNoticeOfEvent,
  cameraNoticeOfRecording,
  cameraPushOf,
} from '../../src/extensions/push/camera-notice';

function event(kind: EventRow['kind'], details: EventRow['details'] = {}): EventRow {
  return {
    id: 'e1',
    device_id: 'cam-1',
    kind,
    occurred_at: '2026-10-18T12:00:00.000Z',
    details,
    acknowledged_at: null,
    created_at: '2026-10-18T12:00:00.000Z',
  };
}

const isCamera = (id: string): boolean => id === 'cam-1';

describe('camera notices from events', () => {
  it('names the notification kind each camera event belongs to', () => {
    const kinds = (
      [
        ['motion', {}],
        ['person', {}],
        ['pet', {}],
        ['sound', {}],
        ['sound', { detection: 'baby_cry' }],
        ['doorbell', {}],
        ['call', {}],
        ['alarm', {}],
        ['device_offline', {}],
      ] as const
    ).map(([kind, details]) => cameraNoticeOfEvent(event(kind, details), isCamera)?.kind);
    expect(kinds).toEqual([
      'motion',
      'person',
      'pet',
      'sound',
      'baby_cry',
      'doorbell',
      'doorbell',
      'alarm',
      'offline',
    ]);
  });

  it('marks a camera coming back online as the recovery of its offline notice', () => {
    expect(cameraNoticeOfEvent(event('device_online'), isCamera)).toMatchObject({
      kind: 'offline',
      recovered: true,
    });
  });

  it('ignores events of other devices, events with no device and kinds it has no switch for', () => {
    expect(cameraNoticeOfEvent({ ...event('leak'), device_id: 'plug' }, isCamera)).toBeNull();
    expect(cameraNoticeOfEvent({ ...event('doorbell'), device_id: 'plug' }, isCamera)).toBeNull();
    expect(cameraNoticeOfEvent({ ...event('doorbell'), device_id: null }, isCamera)).toBeNull();
    expect(cameraNoticeOfEvent(event('leak'), isCamera)).toBeNull();
  });

  it('turns a stored clip, and only a clip, into a clip ready notice', () => {
    const recording: RecordingRow = {
      id: 'r1',
      device_id: 'cam-1',
      event_id: 'e1',
      kind: 'clip',
      storage_path: 'p.mp4',
      started_at: '2026-10-18T12:00:00.000Z',
      duration_ms: 10000,
      bytes: 10,
      created_at: '2026-10-18T12:00:10.000Z',
    };
    expect(cameraNoticeOfRecording(recording)).toMatchObject({ kind: 'clip_ready' });
    expect(cameraNoticeOfRecording({ ...recording, kind: 'snapshot' })).toBeNull();
  });
});

describe('camera notification wording', () => {
  it('replaces the earlier notice of the same camera and kind, quietly when the camera is back', () => {
    const offline = cameraNoticeOfEvent(event('device_offline'), isCamera);
    const back = cameraNoticeOfEvent(event('device_online'), isCamera);
    expect(offline).not.toBeNull();
    expect(back).not.toBeNull();
    if (offline === null || back === null) {
      return;
    }
    const first = cameraPushOf(offline, 'Porch');
    const second = cameraPushOf(back, 'Porch');
    expect(first).toMatchObject({ title: 'Camera offline', body: 'Porch is offline' });
    expect(second).toMatchObject({ title: 'Camera back online', silent: true });
    expect(second.tag).toBe(first.tag);
    expect(first.silent).toBe(false);
  });
});
