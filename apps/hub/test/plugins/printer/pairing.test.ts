import { describe, expect, it } from 'vitest';
import { PrinterError } from '@smarteverything/domain';
import { candidatePaths, parseAddress, portOf } from '../../../src/plugins/builtin/printer/address';
import { pair, type PairingPorts } from '../../../src/plugins/builtin/printer/pairing';
import type { ClientSetup } from '../../../src/plugins/builtin/printer/session-host';

const FINGERPRINT = 'AB:CD';

describe('pairing a printer on a default web port', () => {
  it.each([
    ['https://192.168.50.250:443/ipp/print', 443],
    ['https://192.168.50.250/ipp/print', 443],
    ['ipp://192.168.50.250:80/ipp/print', 80],
    ['http://192.168.50.250/ipp/print', 80],
    ['ipp://192.168.50.250/ipp/print', 631],
  ])('keeps the real port of %s in every candidate address', (uri, port) => {
    const address = parseAddress(uri);
    const ports = candidatePaths(address).map((candidate) => portOf(candidate.url));
    expect(ports.length).toBeGreaterThan(0);
    expect(ports.every((each) => each === port)).toBe(true);
    expect(
      candidatePaths(address).every((candidate) => candidate.uri.includes(`:${String(port)}/`)),
    ).toBe(true);
  });

  it('probes and then connects to port 443 once the owner trusts the certificate, never port 0', async () => {
    const probed: number[] = [];
    const opened: ClientSetup[] = [];
    const ports: PairingPorts = {
      probe: (_host, port) => {
        probed.push(port);
        return Promise.resolve({
          fingerprint: FINGERPRINT,
          subject: 'printer',
          validFrom: '',
          validTo: '',
        });
      },
      openClient: (setup) => {
        opened.push(setup);
        return {
          describe: () => Promise.reject(new PrinterError('unreachable', 'stopped by the test')),
        };
      },
    };
    const uri = 'https://192.168.50.250:443/ipp/print';
    await expect(pair({ uri, credentials: null, fingerprint: null }, ports)).resolves.toMatchObject(
      {
        kind: 'trust',
      },
    );
    expect(opened).toHaveLength(0);
    await expect(
      pair({ uri, credentials: null, fingerprint: FINGERPRINT }, ports),
    ).rejects.toMatchObject({ reason: 'unreachable' });
    expect(probed).toEqual([443, 443]);
    expect(opened).toHaveLength(1);
    expect(opened[0]?.pin).toBe(FINGERPRINT);
    expect(opened[0] === undefined ? null : portOf(opened[0].address.url)).toBe(443);
  });
});
