import { describe, expect, it } from 'vitest';
import {
  SHELLY_KVS_PAGE,
  SHELLY_LIGHT_PATCH,
  SHELLY_PRESENCE_ACTION,
  SHELLY_PRESENCE_ENROLL_REQUEST,
  SHELLY_PRESENCE_OPERATIONS,
  SHELLY_PRESENCE_PATCH,
  SHELLY_SCHEDULE_ROW,
  SHELLY_STORED_VALUE,
  SHELLY_WEBHOOK_ROW,
  SHELLY_ZONE_PATCH,
  shellyPresencePermission,
  shellyScheduledActions,
  type ShellyPresenceAction,
} from '../src/shelly-presence';

function action(raw: unknown): ShellyPresenceAction {
  return SHELLY_PRESENCE_ACTION.parse(raw);
}

function schedule(...calls: unknown[]): ShellyPresenceAction {
  return action({ action: 'schedule_create', schedule: { timespec: '0 0 * * * *', calls } });
}

function ownPermission(name: string): string | undefined {
  return SHELLY_PRESENCE_OPERATIONS.find((operation) => operation.action === name)?.permission;
}

describe('the permission an action needs', () => {
  it('is the one its catalogue entry names for a plain action', () => {
    expect(shellyPresencePermission(action({ action: 'refresh' }))).toBe('read');
    expect(shellyPresencePermission(action({ action: 'set_detection', enable: true }))).toBe(
      'write',
    );
    expect(shellyPresencePermission(action({ action: 'device_reboot' }))).toBe('destructive');
    expect(shellyPresencePermission(action({ action: 'script_start', id: 1 }))).toBe('privileged');
  });

  it('knows every action it can be asked about', () => {
    for (const option of SHELLY_PRESENCE_ACTION.options) {
      expect(ownPermission(option.shape.action.value)).toBeDefined();
    }
  });

  it('is access when a component change opens the hotspot', () => {
    const open = action({
      action: 'set_component',
      config: { component: 'wifi', value: { ap: { enable: true } } },
    });
    const closed = action({
      action: 'set_component',
      config: { component: 'wifi', value: { ap: { enable: false } } },
    });
    expect(shellyPresencePermission(open)).toBe('access');
    expect(shellyPresencePermission(closed)).toBe('privileged');
  });

  it('is access when a component change opens remote control over bluetooth', () => {
    const rpc = (value: object): ShellyPresenceAction =>
      action({ action: 'set_component', config: { component: 'ble', value: { rpc: value } } });
    expect(shellyPresencePermission(rpc({ enable: true }))).toBe('access');
    expect(shellyPresencePermission(rpc({ keep_running: true }))).toBe('access');
    expect(shellyPresencePermission(rpc({ enable: false, keep_running: false }))).toBe(
      'privileged',
    );
    expect(
      shellyPresencePermission(
        action({ action: 'set_component', config: { component: 'ble', value: {} } }),
      ),
    ).toBe('privileged');
  });

  it('is access when a component change listens for remote control over the network', () => {
    const udp = (port: number | null | undefined): ShellyPresenceAction =>
      action({
        action: 'set_component',
        config: {
          component: 'sys',
          value: port === undefined ? { rpc_udp: {} } : { rpc_udp: { listen_port: port } },
        },
      });
    expect(shellyPresencePermission(udp(5000))).toBe('access');
    expect(shellyPresencePermission(udp(null))).toBe('privileged');
    expect(shellyPresencePermission(udp(undefined))).toBe('privileged');
  });

  it('is only privileged for the other components', () => {
    expect(
      shellyPresencePermission(
        action({
          action: 'set_component',
          config: { component: 'cloud', value: { enable: true } },
        }),
      ),
    ).toBe('privileged');
  });

  it('is access when a Bluetooth device is given an encryption key', () => {
    const key = '0123456789abcdef0123456789abcdef';
    expect(
      shellyPresencePermission(
        action({ action: 'bthome_device_config', id: 200, config: { key } }),
      ),
    ).toBe('access');
    expect(
      shellyPresencePermission(
        action({ action: 'bthome_add_device', config: { addr: 'aa:bb:cc:dd:ee:ff', key } }),
      ),
    ).toBe('access');
    expect(
      shellyPresencePermission(action({ action: 'bthome_device_config', id: 200, config: {} })),
    ).toBe('privileged');
    expect(
      shellyPresencePermission(
        action({ action: 'bthome_add_device', config: { addr: 'aa:bb:cc:dd:ee:ff' } }),
      ),
    ).toBe('privileged');
  });

  it('rises to the strongest thing a schedule would do later', () => {
    expect(
      shellyPresencePermission(
        schedule({ method: 'Presence.SetSensor', params: { enable: true } }),
      ),
    ).toBe('privileged');
    expect(shellyPresencePermission(schedule({ method: 'Shelly.Reboot', params: {} }))).toBe(
      'destructive',
    );
    expect(
      shellyPresencePermission(
        schedule(
          { method: 'Shelly.Reboot', params: {} },
          { method: 'WiFi.SetConfig', params: { config: { ap: { enable: true } } } },
        ),
      ),
    ).toBe('access');
  });

  it('does not let a quieter call lower what the schedule itself needs', () => {
    const updated = action({
      action: 'schedule_update',
      id: 1,
      schedule: { calls: [{ method: 'Script.Stop', params: { id: 1 } }] },
    });
    expect(shellyPresencePermission(updated)).toBe('privileged');
  });
});

describe('the actions a schedule would take', () => {
  it('has none unless the action creates or updates a schedule', () => {
    expect(shellyScheduledActions(action({ action: 'refresh' }))).toEqual([]);
    expect(shellyScheduledActions(action({ action: 'schedule_delete_all' }))).toEqual([]);
  });

  it('has none when an update leaves the calls alone', () => {
    expect(
      shellyScheduledActions(
        action({ action: 'schedule_update', id: 1, schedule: { enable: false } }),
      ),
    ).toEqual([]);
  });

  it('turns every kind of call into the action that does the same thing', () => {
    const calls = [
      { method: 'Presence.SetSensor', params: { enable: false } },
      { method: 'Presence.SetConfig', params: { config: { enable: true } } },
      { method: 'PresenceZone.SetConfig', params: { id: 2, config: { name: 'Desk' } } },
      { method: 'Illuminance.SetConfig', params: { id: 3, config: { name: 'Light' } } },
      { method: 'WiFi.SetConfig', params: { config: { ap: { enable: false } } } },
      { method: 'MQTT.SetConfig', params: { config: { enable: true } } },
      { method: 'Sys.SetConfig', params: { config: { sntp: { server: 'time.example' } } } },
      { method: 'Shelly.Reboot', params: { delay_ms: 500 } },
      { method: 'Script.Start', params: { id: 4 } },
      { method: 'Script.Stop', params: { id: 5 } },
    ];
    expect(shellyScheduledActions(schedule(...calls))).toEqual([
      { action: 'set_detection', enable: false },
      { action: 'set_presence', config: { enable: true } },
      { action: 'set_zone', id: 2, config: { name: 'Desk' } },
      { action: 'set_light', id: 3, config: { name: 'Light' } },
      { action: 'set_component', config: { component: 'wifi', value: { ap: { enable: false } } } },
      { action: 'set_component', config: { component: 'mqtt', value: { enable: true } } },
      {
        action: 'set_component',
        config: { component: 'sys', value: { sntp: { server: 'time.example' } } },
      },
      { action: 'device_reboot', delay_ms: 500 },
      { action: 'script_start', id: 4 },
      { action: 'script_stop', id: 5 },
    ]);
  });
});

describe('a schedule read back from the device', () => {
  const row = (calls: unknown[], extra: object = {}): unknown => ({
    id: 1,
    enable: true,
    timespec: '0 0 * * * *',
    calls,
    ...extra,
  });

  it('keeps the calls it understands', () => {
    const parsed = SHELLY_SCHEDULE_ROW.parse(row([{ method: 'Script.Start', params: { id: 2 } }]));
    expect(parsed.calls).toEqual([{ method: 'Script.Start', params: { id: 2 } }]);
    expect(parsed.unavailableCalls).toEqual([]);
  });

  it('sets aside calls it does not understand, by name', () => {
    const parsed = SHELLY_SCHEDULE_ROW.parse(row([{ method: 'Light.Set', params: { id: 0 } }]));
    expect(parsed.calls).toEqual([]);
    expect(parsed.unavailableCalls).toEqual(['Light.Set']);
  });

  it('sets aside a call that carries a secret instead of showing it', () => {
    const parsed = SHELLY_SCHEDULE_ROW.parse(
      row([
        {
          method: 'WiFi.SetConfig',
          params: { config: { sta: { ssid: 'home', pass: 'hunter2' } } },
        },
      ]),
    );
    expect(parsed.calls).toEqual([]);
    expect(parsed.unavailableCalls).toEqual(['WiFi.SetConfig']);
    expect(JSON.stringify(parsed)).not.toContain('hunter2');
  });

  it('adds to the calls the device already reported as unreadable', () => {
    const parsed = SHELLY_SCHEDULE_ROW.parse(
      row([{ method: 'Light.Set' }], { unavailableCalls: ['Earlier.Call'] }),
    );
    expect(parsed.unavailableCalls).toEqual(['Earlier.Call', 'Light.Set']);
  });
});

describe('a webhook read back from the device', () => {
  const hook = (urls: string[], extra: object = {}): unknown => ({
    id: 1,
    event: 'presence.enter',
    cid: 0,
    urls,
    ...extra,
  });

  it('keeps plain addresses as they are', () => {
    const parsed = SHELLY_WEBHOOK_ROW.parse(hook(['https://hub.example/hook']));
    expect(parsed.urls).toEqual(['https://hub.example/hook']);
    expect(parsed.destinationsRedacted).toBe(false);
  });

  it.each([
    ['a user name', 'https://ann@hub.example/hook'],
    ['a password', 'https://:secret@hub.example/hook'],
    ['a query', 'https://hub.example/hook?token=abc'],
    ['a fragment', 'https://hub.example/hook#frag'],
  ])('strips %s and says it did', (_name, url) => {
    const parsed = SHELLY_WEBHOOK_ROW.parse(hook([url]));
    expect(parsed.urls).toEqual(['https://hub.example/hook']);
    expect(parsed.destinationsRedacted).toBe(true);
  });

  it('keeps the flag once any address was stripped', () => {
    const parsed = SHELLY_WEBHOOK_ROW.parse(
      hook(['https://a.example/x', 'https://a.example/y?z=1']),
    );
    expect(parsed.destinationsRedacted).toBe(true);
    expect(
      SHELLY_WEBHOOK_ROW.parse(hook(['https://a.example/x'], { destinationsRedacted: true }))
        .destinationsRedacted,
    ).toBe(true);
  });
});

describe('stored values', () => {
  it('fit 253 bytes of text and no more', () => {
    expect(SHELLY_STORED_VALUE.safeParse('x'.repeat(251)).success).toBe(true);
    expect(SHELLY_STORED_VALUE.safeParse('x'.repeat(252)).success).toBe(false);
    expect(SHELLY_STORED_VALUE.safeParse('é'.repeat(126)).success).toBe(false);
  });

  it('read as a page whether the device sent a map or a list', () => {
    const entry = { etag: 'e1', value: 1 };
    const fromMap = SHELLY_KVS_PAGE.parse({ items: { a: entry } });
    const fromList = SHELLY_KVS_PAGE.parse({ items: [{ key: 'a', ...entry }] });
    expect(fromMap.items).toEqual({ a: entry });
    expect(fromList.items).toEqual({ a: entry });
  });

  it('fill in the offset and the total when the device left them out', () => {
    const page = SHELLY_KVS_PAGE.parse({
      items: { a: { etag: 'e', value: 1 }, b: { etag: 'f', value: 2 } },
    });
    expect(page).toMatchObject({ offset: 0, total: 2 });
    expect(SHELLY_KVS_PAGE.parse({ items: {}, offset: 5, total: 9 })).toMatchObject({
      offset: 5,
      total: 9,
    });
  });
});

describe('changes to the sensor settings', () => {
  it('refuses a sensitivity preset together with custom tuning', () => {
    expect(
      SHELLY_PRESENCE_PATCH.safeParse({ sensor: { sensitivity: 'high', points: 50 } }).success,
    ).toBe(false);
    expect(SHELLY_PRESENCE_PATCH.safeParse({ sensor: { sensitivity: 'high' } }).success).toBe(true);
    expect(SHELLY_PRESENCE_PATCH.safeParse({ sensor: { points: 50, velocity: 0.5 } }).success).toBe(
      true,
    );
  });

  it('refuses a minimum detection height at or above the maximum', () => {
    expect(SHELLY_PRESENCE_PATCH.safeParse({ zmin: 2, zmax: 1 }).success).toBe(false);
    expect(SHELLY_PRESENCE_PATCH.safeParse({ zmin: 1, zmax: 1 }).success).toBe(false);
    expect(SHELLY_PRESENCE_PATCH.safeParse({ zmin: 1, zmax: 2 }).success).toBe(true);
    expect(SHELLY_PRESENCE_PATCH.safeParse({ zmin: 1 }).success).toBe(true);
    expect(SHELLY_PRESENCE_PATCH.safeParse({ zmin: null, zmax: 2 }).success).toBe(true);
    expect(SHELLY_PRESENCE_PATCH.safeParse({ zmin: 1, zmax: null }).success).toBe(true);
    expect(SHELLY_PRESENCE_PATCH.safeParse({ zmax: 2 }).success).toBe(true);
  });

  it('refuses a dark threshold at or above the bright one', () => {
    expect(SHELLY_LIGHT_PATCH.safeParse({ dark_thr: 100, bright_thr: 50 }).success).toBe(false);
    expect(SHELLY_LIGHT_PATCH.safeParse({ dark_thr: 10, bright_thr: 50 }).success).toBe(true);
    expect(SHELLY_LIGHT_PATCH.safeParse({ dark_thr: 10 }).success).toBe(true);
    expect(SHELLY_LIGHT_PATCH.safeParse({ bright_thr: 10 }).success).toBe(true);
  });

  it('never lets a zone patch change the zone identity or its thresholds', () => {
    expect(SHELLY_ZONE_PATCH.safeParse({ id: 3 }).success).toBe(false);
    expect(SHELLY_ZONE_PATCH.safeParse({ presence_thr: 3 }).success).toBe(false);
  });
});

describe('enrolling a device', () => {
  it('takes a bare local origin and nothing else in the address', () => {
    for (const address of ['http://192.168.1.5', 'https://shelly.local/']) {
      expect(SHELLY_PRESENCE_ENROLL_REQUEST.safeParse({ address }).success).toBe(true);
    }
    for (const address of [
      'http://ann@192.168.1.5',
      'http://:pw@192.168.1.5',
      'http://192.168.1.5?x=1',
      'http://192.168.1.5#x',
      'http://192.168.1.5/rpc',
      'ftp://192.168.1.5',
    ]) {
      expect(SHELLY_PRESENCE_ENROLL_REQUEST.safeParse({ address }).success).toBe(false);
    }
  });

  it('asks for the client certificate and its key together', () => {
    const tls = (value: object): boolean =>
      SHELLY_PRESENCE_ENROLL_REQUEST.safeParse({ address: 'http://192.168.1.5', tls: value })
        .success;
    expect(tls({ caPem: 'ca' })).toBe(true);
    expect(tls({ clientCertificate: 'c', clientKey: 'k' })).toBe(true);
    expect(tls({ clientCertificate: 'c' })).toBe(false);
    expect(tls({ clientKey: 'k' })).toBe(false);
  });
});
