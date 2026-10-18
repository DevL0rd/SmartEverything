import { describe, expect, it } from 'vitest';
import {
  RING_FOR_MS,
  newRings,
  ringTitle,
  ringingCameraIds,
  stillRinging,
  type RingSource,
} from './ringing';

const NOW = Date.parse('2026-10-08T18:00:00.000Z');

function event(id: string, kind: string, secondsAgo: number): RingSource {
  return {
    id,
    device_id: 'door',
    kind,
    occurred_at: new Date(NOW - secondsAgo * 1000).toISOString(),
    acknowledged_at: null,
  };
}

const cameras = new Set(['door']);

describe('which events ring', () => {
  it('rings for new, unanswered calls and doorbell presses from a camera, oldest first', () => {
    const rings = newRings(
      [event('b', 'doorbell', 5), event('a', 'call', 20), event('m', 'motion', 1)],
      new Set(),
      cameras,
      NOW,
    );
    expect(rings).toStrictEqual([
      {
        eventId: 'a',
        deviceId: 'door',
        kind: 'call',
        occurredAt: event('a', 'call', 20).occurred_at,
      },
      {
        eventId: 'b',
        deviceId: 'door',
        kind: 'doorbell',
        occurredAt: event('b', 'doorbell', 5).occurred_at,
      },
    ]);
  });

  it('does not ring for seen, answered, old or non camera events', () => {
    const rings = newRings(
      [
        event('seen', 'call', 1),
        { ...event('answered', 'call', 1), acknowledged_at: new Date(NOW).toISOString() },
        event('old', 'call', 61),
        { ...event('other', 'call', 1), device_id: 'lamp' },
        { ...event('home', 'call', 1), device_id: null },
      ],
      new Set(['seen']),
      cameras,
      NOW,
    );
    expect(rings).toStrictEqual([]);
    expect(newRings([event('edge', 'call', 60)], new Set(), cameras, NOW)).toHaveLength(1);
  });

  it('stops ringing after the ring time', () => {
    const ring = newRings([event('a', 'call', 0)], new Set(), cameras, NOW)[0];
    expect(ring).toBeDefined();
    if (ring !== undefined) {
      expect(stillRinging(ring, NOW + RING_FOR_MS - 1)).toBe(true);
      expect(stillRinging(ring, NOW + RING_FOR_MS)).toBe(false);
    }
  });

  it('says who is calling', () => {
    expect(ringTitle('call', 'Nursery')).toBe('Nursery is calling');
    expect(ringTitle('doorbell', 'Front door')).toBe('Someone rang at Front door');
  });
});

describe('which cameras may ring this person', () => {
  it('rings for every camera unless the person turned one off', () => {
    expect([...ringingCameraIds(['door', 'nursery'], { muted: ['nursery'] })]).toEqual(['door']);
  });

  it('still rings when the saved setting cannot be read', () => {
    expect([...ringingCameraIds(['door', 'nursery'], null)]).toEqual(['door', 'nursery']);
  });
});
