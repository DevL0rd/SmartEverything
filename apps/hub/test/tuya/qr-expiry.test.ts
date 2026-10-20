import { PROVIDER_PROMPT, type ProviderPrompt } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { describe, expect, it } from 'vitest';
import type { ShownPrompt } from '../../src/adapters/contract';
import { signInWithUserCode } from '../../src/adapters/tuya/smart-life-link';

const NOW = Date.parse('2026-10-16T10:00:00.000Z');
const TIMEOUT_MS = 5 * 60_000;

function reply(body: unknown): Response {
  return new Response(JSON.stringify(body));
}

describe('Smart Life QR prompt', () => {
  it('carries the moment the hub stops waiting for the scan, and keeps it as the hub polls', async () => {
    const shown: ProviderPrompt[] = [];
    let withdraw: (cause: Error) => void = () => undefined;
    const prompt: ShownPrompt = {
      answer: new Promise((_resolve, reject) => {
        withdraw = reject;
      }),
      dismiss: () => Promise.resolve(),
    };
    let polls = 0;
    const signingIn = signInWithUserCode(
      'EU1234',
      {
        now: () => NOW + polls * 1000,
        timing: {
          irLearnTimeoutMs: 1,
          qrScanQueryMs: 1,
          qrScanTimeoutMs: TIMEOUT_MS,
          messagingRenewMarginMs: 1,
          inventorySettleMs: 1,
          reconnectDelay: () => 1,
        },
        fetch: (input) => {
          if (typeof input === 'string' && input.includes('/tokens?')) {
            return Promise.resolve(reply({ success: true, result: { qrcode: 'token-1' } }));
          }
          polls += 1;
          if (polls === 3) {
            withdraw(new Error('stopped'));
          }
          return Promise.resolve(reply({ success: false, code: 'E0020003' }));
        },
      },
      {
        log: new Logger('tool.tuya-test'),
        dataDirectory: '/nonexistent',
        ask: () => Promise.reject(new Error('never asked')),
        show: (value) => {
          shown.push(PROVIDER_PROMPT.parse(value));
          return Promise.resolve(prompt);
        },
      },
    );
    await expect(signingIn).rejects.toThrow('cancelled before the QR code was confirmed');
    expect(shown).toStrictEqual([
      {
        kind: 'scan_qr',
        app: 'Smart Life or Tuya Smart',
        content: 'tuyaSmart--qrLogin?token=token-1',
        issuedAt: new Date(NOW).toISOString(),
        expiresAt: new Date(NOW + TIMEOUT_MS).toISOString(),
      },
    ]);
  });
});
