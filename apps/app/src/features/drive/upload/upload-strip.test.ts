import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { COLOUR_VARIABLE, PaletteContext } from '../../../design/colour-roles';

vi.mock('./transport/client', () => ({ startUpload: vi.fn() }));
vi.mock('../../../components/charts', () => ({ ProgressBar: (): null => null }));

import type { FolderUploadsView } from './drive-uploads';
import { summaryOf, type UploadRow } from './upload-model';
import { UploadStrip } from './upload-strip';

const ROWS: readonly UploadRow[] = [
  {
    key: 'a',
    name: 'Walkthrough.mov',
    size: 1000,
    sent: 640,
    state: { kind: 'sending', progress: 0.64 },
  },
  {
    key: 'b',
    name: 'Lease.pdf',
    size: 100,
    sent: 100,
    state: { kind: 'done', storedAs: 'Lease (2).pdf' },
  },
  {
    key: 'c',
    name: 'Tax.pdf',
    size: 100,
    sent: 0,
    state: { kind: 'failed', text: 'The hub’s disk is full. Nothing was saved.', retryable: false },
  },
];

function render(view: FolderUploadsView): string {
  return renderToStaticMarkup(
    createElement(
      PaletteContext,
      { value: COLOUR_VARIABLE },
      createElement(UploadStrip, { view, placeId: 'f', placeName: 'Kitchen remodel' }),
    ),
  );
}

describe('upload strip', () => {
  it('shows progress, the clash name and the plain failure for each file', () => {
    const html = render({ rows: ROWS, summary: summaryOf(ROWS), rate: 2_000_000 });
    expect(html).toContain('Uploading 3 of 3 to Kitchen remodel');
    expect(html).toContain('Named Lease (2).pdf');
    expect(html).toContain('The hub’s disk is full. Nothing was saved.');
    expect(html).toContain('Pause uploads');
    expect(html).toContain('Cancel Walkthrough.mov');
    expect(html).not.toContain('Retry now');
  });

  it('gathers files the hub stopped answering for into one retry notice', () => {
    const lost: readonly UploadRow[] = [
      {
        key: 'd',
        name: 'Hallway.mp4',
        size: 100,
        sent: 12,
        state: { kind: 'failed', text: 'unused', retryable: true },
      },
    ];
    const html = render({ rows: lost, summary: summaryOf(lost), rate: null });
    expect(html).toContain('1 upload failed');
    expect(html).toContain('Retry now');
    expect(html).toContain('Failed at 12 %');
    expect(html).toContain('Close uploads');
  });

  it('loads the folder drop target and the file chooser', async () => {
    const { FolderUploads, chooseUploads } = await import('./index');
    expect(FolderUploads).toBeTypeOf('function');
    expect(chooseUploads).toBeTypeOf('function');
  });
});
