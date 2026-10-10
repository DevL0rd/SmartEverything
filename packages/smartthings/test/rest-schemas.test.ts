import { describe, expect, it } from 'vitest';
import {
  COMMAND_RESPONSE,
  DEVICE,
  DEVICE_LIST,
  DEVICE_STATUS,
  describeErrorEnvelope,
  ERROR_ENVELOPE,
  LOCATION_LIST,
  nextPageOf,
  ROOM_LIST,
} from '../src/rest-schemas';

describe('the SmartThings REST shapes', () => {
  it('reads locations and rooms, which may come without links', () => {
    expect(
      LOCATION_LIST.parse({ items: [{ locationId: 'location-1', name: 'Home' }], _links: null })
        .items,
    ).toEqual([{ locationId: 'location-1', name: 'Home' }]);
    expect(
      ROOM_LIST.parse({
        items: [
          { roomId: 'room-1', locationId: 'location-1', name: 'Theater', backgroundImage: null },
        ],
      }).items,
    ).toEqual([{ roomId: 'room-1', locationId: 'location-1', name: 'Theater' }]);
  });

  it('reads a page of devices and its next link', () => {
    const page = DEVICE_LIST.parse({
      items: [{ deviceId: 'device-1' }],
      _links: { next: { href: 'https://api.smartthings.com/v1/devices?page=2' }, previous: null },
    });
    expect(page.items).toEqual([{ deviceId: 'device-1' }]);
    expect(nextPageOf(page)).toBe('https://api.smartthings.com/v1/devices?page=2');
    expect(
      nextPageOf(
        LOCATION_LIST.parse({ items: [], _links: { next: { href: 'https://x.test/2' } } }),
      ),
    ).toBe('https://x.test/2');
  });

  it('follows the next link when there is one', () => {
    expect(
      nextPageOf({ _links: { next: { href: 'https://api.smartthings.com/v1/devices?page=2' } } }),
    ).toBe('https://api.smartthings.com/v1/devices?page=2');
    expect(nextPageOf({ _links: { next: null } })).toBeNull();
    expect(nextPageOf({ _links: {} })).toBeNull();
    expect(nextPageOf({ _links: null })).toBeNull();
    expect(nextPageOf({})).toBeNull();
  });

  it('reads a device with its components, categories and embedded status', () => {
    const device = DEVICE.parse({
      deviceId: 'd',
      label: 'Lamp',
      manufacturerName: 'SmartThings',
      locationId: 'l',
      roomId: null,
      components: [
        {
          id: 'main',
          capabilities: [
            { id: 'switch', version: 1, status: { switch: { value: 'on', timestamp: 't' } } },
          ],
          categories: [{ name: 'Light', categoryType: 'manufacturer' }],
        },
      ],
      healthState: { state: 'ONLINE', lastUpdatedDate: 't' },
    });
    expect(device.components[0]?.capabilities[0]?.status).toEqual({
      switch: { value: 'on', timestamp: 't' },
    });
    expect(device.healthState).toEqual({ state: 'ONLINE' });
  });

  it('refuses a device without components', () => {
    expect(
      DEVICE.safeParse({ deviceId: 'd', manufacturerName: 'm', locationId: 'l', components: [] })
        .success,
    ).toBe(false);
  });

  it('reads a device status, whose values may be null', () => {
    expect(
      DEVICE_STATUS.parse({
        components: { main: { mediaPlayback: { playbackStatus: { value: null } } } },
      }),
    ).toEqual({ components: { main: { mediaPlayback: { playbackStatus: { value: null } } } } });
  });

  it('reads command results', () => {
    expect(COMMAND_RESPONSE.parse({ results: [{ id: 'c', status: 'ACCEPTED' }] })).toEqual({
      results: [{ id: 'c', status: 'ACCEPTED' }],
    });
  });

  it('describes an error envelope with the reasons in its details', () => {
    const envelope = ERROR_ENVELOPE.parse({
      requestId: '3051095549439698997',
      error: {
        code: 'ConstraintViolationError',
        message: 'The request is malformed.',
        details: [
          {
            code: 'UnprocessableEntityError',
            target: 'commands[0].arguments[0]',
            message: 'commands[0].arguments[0]: must have a maximum value of 30000',
            details: [],
          },
          { code: 'Other', message: 'second', details: null },
        ],
      },
    });
    expect(describeErrorEnvelope(envelope)).toBe(
      'ConstraintViolationError: The request is malformed. (commands[0].arguments[0]: must have a maximum value of 30000; second)',
    );
    expect(describeErrorEnvelope({ error: { code: 'Forbidden', message: 'No.' } })).toBe(
      'Forbidden: No.',
    );
  });
});
