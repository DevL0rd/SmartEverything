import type { Pairing } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { pairingQrText } from '../../../api/pairing-input';
import type { QrCodeProps } from '../../../components/qr-code';

interface TextProps {
  readonly children: ReactNode;
  readonly numberOfLines?: number;
}

interface CopyProps {
  readonly label: string;
  readonly value: string;
}

const rendered = vi.hoisted(() => ({
  text: vi.fn<(_: TextProps) => null>(() => null),
  copy: vi.fn<(_: CopyProps) => null>(() => null),
  qr: vi.fn<(_: QrCodeProps) => null>(() => null),
}));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({ View: childrenOf, Text: rendered.text }));
vi.mock('../../../components/text', () => ({ Text: childrenOf }));
vi.mock('../../../components/copy-button', () => ({
  CopyButton: rendered.copy,
  copyText: vi.fn(),
}));
vi.mock('../../../components/qr-code', () => ({ QrCode: rendered.qr }));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => label,
}));

const { PairingCodeView } = await import('./pairing-code-view');

const SERVER_ADDRESS = 'https://' + 'fixture'.repeat(8) + '.example.invalid';
const CODE = 'ABCD-EFGH';
const FINGERPRINT = '1'.repeat(64);
const PAIRING: Pairing = {
  code: CODE,
  expiresAt: '2026-11-06T10:30:00.000Z',
  qr: {
    url: SERVER_ADDRESS,
    code: CODE,
    identity: {
      id: FINGERPRINT,
      name: 'Fixture home',
      protocolVersion: 1,
      tls: {
        serverName: `smarteverything-${'1'.repeat(32)}.local`,
        certificateSha256: '2'.repeat(64),
        publicKeySha256: FINGERPRINT,
      },
    },
    endpoints: [{ kind: 'remote', url: SERVER_ADDRESS }],
  },
};

describe('Pair a device code display', () => {
  it('wraps the exact server address and keeps the QR, manual code and invitation controls', () => {
    const html = renderToStaticMarkup(createElement(PairingCodeView, { pairing: PAIRING }));
    const values = rendered.text.mock.calls.map(([props]) => props);
    const address = values.find(({ children }) => children === SERVER_ADDRESS);
    expect(address).toBeDefined();
    expect(address?.numberOfLines).toBeUndefined();
    expect(values.find(({ children }) => children === CODE)?.numberOfLines).toBe(1);
    expect(rendered.copy.mock.calls.map(([props]) => props.value)).toEqual([SERVER_ADDRESS, CODE]);
    expect(rendered.qr.mock.lastCall?.[0]).toEqual({
      text: pairingQrText(PAIRING.qr),
      size: 232,
      label: 'Pairing code to scan',
    });
    expect(html).toContain('Copy invitation');
    expect(html).toContain('On the new device');
    expect(html).toContain('enter the pairing code');
  });
});
