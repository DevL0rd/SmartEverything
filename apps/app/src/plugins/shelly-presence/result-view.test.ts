import { describe, expect, it } from 'vitest';
import { typedResult } from './result-view';

describe('typed device results', () => {
  it('lists nearby Wi-Fi networks and keeps hidden ones', () => {
    const typed = typedResult({
      results: [
        { ssid: 'Home', bssid: 'aa:bb', rssi: -52, channel: 6 },
        { ssid: null, bssid: 'cc:dd', rssi: -80, channel: 11 },
      ],
    });
    expect(typed).toStrictEqual({
      kind: 'networks',
      networks: [
        { ssid: 'Home', bssid: 'aa:bb', rssi: -52, channel: 6 },
        { ssid: null, bssid: 'cc:dd', rssi: -80, channel: 11 },
      ],
    });
  });

  it('offers the Matter pairing code and QR payload to copy', () => {
    expect(typedResult({ manual_code: '3497-0112-332', qr_code: 'MT:Y.K90' })).toStrictEqual({
      kind: 'matter',
      code: '3497-0112-332',
      qr: 'MT:Y.K90',
    });
  });

  it('recognises device logs and falls back to the generic tree otherwise', () => {
    expect(typedResult({ text: 'line', name: 'log.txt' })).toMatchObject({ kind: 'log' });
    expect(typedResult({ files: [{ name: 'a', path: '/a' }] })).toMatchObject({ kind: 'files' });
    expect(typedResult({ ap_clients: [] })).toBeNull();
  });
});
