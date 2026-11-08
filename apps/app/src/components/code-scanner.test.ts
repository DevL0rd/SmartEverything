import { PermissionStatus, type PermissionResponse } from 'expo-camera';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CodeScanner } from './code-scanner';

interface Children {
  readonly children: ReactNode;
}

const camera = vi.hoisted((): { permission: PermissionResponse | null } => ({ permission: null }));

vi.mock('expo-camera', () => ({
  CameraView: (): ReactNode => createElement('div', { 'data-preview': true }),
  PermissionStatus: { DENIED: 'denied', GRANTED: 'granted' },
  useCameraPermissions: (): readonly [PermissionResponse | null, () => Promise<never>] => [
    camera.permission,
    (): Promise<never> => Promise.reject(new Error('No real camera in the fixture.')),
  ],
}));
vi.mock('uniwind', () => ({
  withUniwind: <T>(component: T): T => component,
}));
vi.mock('../design/theme-scope', () => ({
  ThemeScope: ({ theme, children }: Children & { readonly theme: string }): ReactNode =>
    createElement('div', { 'data-preview-theme': theme }, children),
}));
vi.mock('react-native', () => ({
  View: ({ className, children }: Children & { readonly className: string }): ReactNode =>
    createElement('div', { className }, children),
  ScrollView: ({ children }: Children): ReactNode => createElement('div', null, children),
  ActivityIndicator: ({ accessibilityLabel }: { readonly accessibilityLabel: string }): ReactNode =>
    createElement('div', { role: 'status' }, accessibilityLabel),
}));
vi.mock('./button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode =>
    createElement('button', null, label),
}));
vi.mock('./empty-state', () => ({
  EmptyState: ({
    title,
    action,
  }: {
    readonly title: string;
    readonly action: ReactNode;
  }): ReactNode => createElement('div', null, title, action),
}));
vi.mock('./icon-button', () => ({
  IconButton: ({ label }: { readonly label: string }): ReactNode =>
    createElement('button', null, label),
}));
vi.mock('./text', () => ({
  Text: ({ children }: Children): ReactNode => createElement('span', null, children),
}));

function scanner(): string {
  return renderToStaticMarkup(
    createElement(CodeScanner, {
      types: ['ean13'],
      hint: 'Point at the barcode on the pack',
      purpose: 'It is used only to read food barcodes.',
      shape: 'wide',
      read: (): null => null,
      onClose: vi.fn(),
    }),
  );
}

describe('scanner access states', () => {
  it('offers a close button and progress while camera access is pending', () => {
    camera.permission = null;
    const html = scanner();

    expect(html).toContain('flex-1 bg-bg');
    expect(html).toContain('<button>Close scanner</button>');
    expect(html).toContain('<div role="status">Checking camera access</div>');
  });

  it('keeps the close button alongside the permission action', () => {
    camera.permission = {
      status: PermissionStatus.DENIED,
      granted: false,
      expires: 'never',
      canAskAgain: false,
    };
    const html = scanner();

    expect(html).toContain('flex-1 bg-bg');
    expect(html).toContain('<button>Close scanner</button>');
    expect(html).toContain('<button>Open settings</button>');
  });

  it('shows the preview and scanner controls when permission is granted', () => {
    camera.permission = {
      status: PermissionStatus.GRANTED,
      granted: true,
      expires: 'never',
      canAskAgain: true,
    };
    const html = scanner();

    expect(html).toContain('data-preview="true"');
    expect(html).toContain('data-preview-theme="dark"');
    expect(html).toContain('<button>Close scanner</button>');
    expect(html).toContain('<button>Turn torch on</button>');
    expect(html).toContain('Point at the barcode on the pack');
  });
});
