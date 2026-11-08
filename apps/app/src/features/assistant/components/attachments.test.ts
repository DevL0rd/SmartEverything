import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AssistantAttachment } from '@smarteverything/domain';
import { Attachments } from './attachments';
import { fileKindOf, typeTagOf } from './file-kind';
import { IMAGE_MAX, gridOf, rowSizesOf } from './image-grid';

interface LinkData {
  readonly data: Readonly<Record<string, { readonly url: string }>> | undefined;
  readonly isError: boolean;
  readonly isFetching: boolean;
  readonly refetch: () => Promise<void>;
}

const links = vi.hoisted(() => {
  const current: LinkData = {
    data: undefined,
    isError: false,
    isFetching: false,
    refetch: () => Promise.resolve(),
  };
  return { current };
});

vi.mock('../../../design/colour', () => ({ useColour: (role: string): string => role }));
vi.mock('../data/remote', () => ({ useAttachmentLinks: (): LinkData => links.current }));
vi.mock('./image-viewer', () => ({ ImageViewer: (): null => null }));

function attachment(
  index: number,
  mime: string,
  name: string,
  size: number | null = null,
): AssistantAttachment {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name,
    mime,
    bytes: 188_416,
    width: size,
    height: size,
  };
}

const squares = (count: number): readonly number[] => Array.from({ length: count }, () => 1);

describe('rowSizesOf', () => {
  it('lays equal images in justified rows of 2 or 3, the smaller rows first', () => {
    expect(rowSizesOf(squares(1))).toEqual([1]);
    expect(rowSizesOf(squares(2))).toEqual([2]);
    expect(rowSizesOf(squares(3))).toEqual([3]);
    expect(rowSizesOf(squares(4))).toEqual([2, 2]);
    expect(rowSizesOf(squares(5))).toEqual([2, 3]);
    expect(rowSizesOf(squares(6))).toEqual([3, 3]);
    expect(rowSizesOf(squares(7))).toEqual([2, 2, 3]);
    expect(rowSizesOf(squares(9))).toEqual([3, 3, 3]);
  });

  it('puts wide images two to a row', () => {
    expect(rowSizesOf([2, 2, 2, 2, 2, 2])).toEqual([2, 2, 2]);
  });

  it('shows every image, however many there are', () => {
    const sizes = rowSizesOf(squares(41));
    expect(sizes.reduce((total, size) => total + size, 0)).toBe(41);
    expect(sizes.every((size) => size === 2 || size === 3)).toBe(true);
  });
});

describe('gridOf', () => {
  it('keeps one image at its natural aspect and at most the maximum height', () => {
    expect(gridOf([{ width: 600, height: 800 }]).width).toBe(IMAGE_MAX * 0.75);
    expect(gridOf([{ width: 1600, height: 900 }]).width).toBeGreaterThan(IMAGE_MAX);
    expect(gridOf([{ width: null, height: null }]).rows[0]?.aspect).toBe(1);
  });

  it('never shrinks a large group below the maximum width', () => {
    const grid = gridOf(Array.from({ length: 20 }, () => ({ width: 10, height: 10 })));
    expect(grid.width).toBe(IMAGE_MAX);
    expect(grid.rows.flatMap((row) => row.cells.map((cell) => cell.index))).toEqual(
      Array.from({ length: 20 }, (_, index) => index),
    );
  });
});

describe('fileKindOf', () => {
  it('sorts files into their families by type and extension', () => {
    expect(fileKindOf({ name: 'plan.pdf', mime: 'application/pdf' })).toBe('pdf');
    expect(fileKindOf({ name: 'prices.xlsx', mime: 'application/vnd.ms-excel' })).toBe('sheet');
    expect(fileKindOf({ name: 'bulbs.csv', mime: 'text/csv' })).toBe('sheet');
    expect(fileKindOf({ name: 'sensor.ts', mime: 'application/octet-stream' })).toBe('code');
    expect(fileKindOf({ name: 'logs.zip', mime: 'application/zip' })).toBe('archive');
    expect(fileKindOf({ name: 'notes.txt', mime: 'text/plain' })).toBe('document');
    expect(fileKindOf({ name: 'clip.mp4', mime: 'video/mp4' })).toBe('video');
    expect(fileKindOf({ name: 'blob', mime: 'application/octet-stream' })).toBe('other');
  });

  it('tags a file with its extension', () => {
    expect(typeTagOf('night-mode.yaml')).toBe('YAML');
    expect(typeTagOf('.env')).toBeNull();
    expect(typeTagOf('README')).toBeNull();
  });
});

describe('Attachments', () => {
  it('shows every image of a loading group and a file line with its name, tag and size', () => {
    const images = Array.from({ length: 5 }, (_, index) =>
      attachment(index + 1, 'image/jpeg', `photo-${String(index)}.jpg`, 800),
    );
    const file = attachment(9, 'application/pdf', 'Kitchen lights plan.pdf');
    links.current = { ...links.current, data: undefined };
    const markup = renderToStaticMarkup(
      createElement(Attachments, { attachments: [...images, file] }),
    );
    for (const image of images) expect(markup).toContain(`View ${image.name}`);
    expect(markup).toContain('Open Kitchen lights plan.pdf');
    expect(markup).toContain('PDF');
    expect(markup).toContain('184\u00a0KB');
  });

  it('keeps the frame of an image whose link failed with a Retry', () => {
    const image = attachment(1, 'image/png', 'hall.png', 640);
    links.current = { ...links.current, data: {}, isError: false };
    const markup = renderToStaticMarkup(createElement(Attachments, { attachments: [image] }));
    expect(markup).toContain('Retry loading hall.png');
    expect(markup).not.toContain('View hall.png');
  });
});
