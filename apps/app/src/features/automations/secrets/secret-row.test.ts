import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SecretRow } from './secret-row';
import type { SecretRowModel } from './secrets-model';

vi.mock('../../../components/card', () => ({
  Card: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/text', () => ({
  Text: ({
    children,
    numberOfLines,
  }: {
    readonly children: ReactNode;
    readonly numberOfLines?: number;
  }): ReactNode => createElement('span', { 'data-line-limit': numberOfLines }, children),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => createElement('button', {}, label),
}));

it('lets secret metadata wrap and keeps write actions restricted to owners', () => {
  const row: SecretRowModel = {
    id: 'synthetic-secret',
    name: 'A Wide Webhook Credential For The Weekend Hallway Lighting And Window Workflow',
    added: '15 Jan 2024',
    updated: '6 Nov',
    users: [],
    usesLabel: 'Not used yet',
  };
  const props = { row, refusal: null, onReplace: vi.fn(), onRemove: vi.fn() };
  const readOnly = renderToStaticMarkup(createElement(SecretRow, { ...props, readOnly: true }));
  expect(readOnly).toContain(`<span>${row.name}</span>`);
  expect(readOnly).toContain('<span>Added 15 Jan 2024 · Value replaced 6 Nov</span>');
  expect(readOnly).not.toContain('<button>');
  const owner = renderToStaticMarkup(createElement(SecretRow, { ...props, readOnly: false }));
  expect(owner).toContain('<button>Replace value</button>');
  expect(owner).toContain('<button>Remove</button>');
});
