import type { ProviderLinkRow } from '@smarteverything/domain';

export function qrMinutesLeft(row: ProviderLinkRow | null, now: number): number | null {
  const prompt = row?.prompt;
  return prompt?.kind === 'scan_qr'
    ? Math.ceil((Date.parse(prompt.expiresAt) - now) / 60_000)
    : null;
}
