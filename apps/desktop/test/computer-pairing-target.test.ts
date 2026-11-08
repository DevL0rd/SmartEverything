import { describe, expect, it } from 'vitest';
import { requireEnrolledPairingHub } from '../src/service/computer-pairing-target.js';

const pairing = {
  url: 'http://127.0.0.1:7880',
  code: 'ABCD-EFGH',
  expires_at: '2026-11-06T00:00:00Z',
  pin: null,
};
const enrolled = { url: pairing.url, token: 'fixture' };

describe('the destination of an enrolled desktop credential', () => {
  it('allows a code for the exact enrolled Hub origin', () => {
    expect(requireEnrolledPairingHub(enrolled, pairing)).toBe(enrolled);
  });

  it('rejects a different loopback port before handing out the window credential', () => {
    expect(() =>
      requireEnrolledPairingHub(enrolled, { ...pairing, url: 'http://127.0.0.1:7999' }),
    ).toThrow('enrolled Hub address');
  });

  it('requires the pin of the enrolled HTTPS Hub', () => {
    expect(() =>
      requireEnrolledPairingHub(
        { ...enrolled, url: 'https://home.example' },
        { ...pairing, url: 'https://home.example', pin: 'a'.repeat(64) },
      ),
    ).toThrow('enrolled Hub address');
  });
});
