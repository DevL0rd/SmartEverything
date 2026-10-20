import type { ProviderLinkRow } from '@smarteverything/domain';

export function qrMinutesLeft(row: ProviderLinkRow | null, now: number): number | null {
  const prompt = row?.prompt;
  return prompt?.kind === 'scan_qr'
    ? Math.ceil((Date.parse(prompt.expiresAt) - now) / 60_000)
    : null;
}

export function qrShareLeft(row: ProviderLinkRow | null, now: number): number | null {
  const prompt = row?.prompt;
  if (prompt?.kind !== 'scan_qr' || prompt.issuedAt === undefined) {
    return null;
  }
  const lifetime = Date.parse(prompt.expiresAt) - Date.parse(prompt.issuedAt);
  if (lifetime <= 0) {
    return null;
  }
  return Math.min(1, Math.max(0, (Date.parse(prompt.expiresAt) - now) / lifetime));
}
