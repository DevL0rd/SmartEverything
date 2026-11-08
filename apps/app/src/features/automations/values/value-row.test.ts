import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AUTOMATION_VALUE_ROW } from '@smarteverything/domain';
import { expect, it, vi } from 'vitest';
import type { ListRowProps } from '../../../components/list-row';
import { ValueRowItem } from './value-row';

vi.mock('../../../components/list-row', () => ({
  ListRow: ({ title, subtitle, wrapTitle, wrapSubtitle }: ListRowProps): ReactNode =>
    createElement(
      'div',
      { 'data-title-wrap': wrapTitle, 'data-subtitle-wrap': wrapSubtitle },
      title,
      ' · ',
      subtitle,
    ),
}));

it('lets a long Value name and selected choice wrap in their existing row', () => {
  const name = 'A Wide Hallway Welcome Arrangement With Warm White Weekend Lighting Presets';
  const choice = 'Warm White Weekend Lighting With Maximum Window And Walkway Fixture Warmth';
  const id = '00000000-0000-4000-8000-000000000002';
  const date = '2026-10-18T18:30:00.000Z';
  const row = AUTOMATION_VALUE_ROW.parse({
    id: '00000000-0000-4000-8000-000000000001',
    revision: 1,
    created_at: date,
    updated_at: date,
    content: {
      kind: 'choice',
      name,
      value: id,
      choices: [{ id, label: choice }],
      overflow: 'wrap',
    },
  });
  const markup = renderToStaticMarkup(
    createElement(ValueRowItem, { row, onOpen: (): void => undefined }),
  );
  expect(markup).toContain('data-title-wrap="true" data-subtitle-wrap="true"');
  expect(markup).toContain(name);
  expect(markup).toContain(`List · ${choice}`);
});
