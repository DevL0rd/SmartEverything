import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());
const picked = vi.hoisted(() => ({ files: new Array<unknown>() }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({
  View: stub('View'),
  ScrollView: stub('ScrollView'),
  Platform: { OS: 'android' },
}));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/charts/progress-bar', () => ({ ProgressBar: stub('ProgressBar') }));
vi.mock('../../../../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../../../../design/size-class', () => ({
  useSizeClass: (): { width: string } => ({ width: 'compact' }),
  atLeast: (): boolean => false,
}));
vi.mock('../../../../platform/pick-files', () => ({
  pickFiles: (): Promise<readonly unknown[]> => Promise.resolve(picked.files),
}));

const { RealisticState, realisticBody, realisticNotices, SCAN_HELP_PATH } =
  await import('./realistic-states');
const { ScanUploads } = await import('../../data/scan-upload');

const MB = 1024 ** 2;
const IDLE = { kind: 'idle' } as const;
const SHOWN = { webgl2: true, linked: true, loadFailed: null } as const;

function uploadsWith(states: Record<string, unknown>[]): InstanceType<typeof ScanUploads> {
  const uploads = new ScanUploads(
    (request) =>
      new Promise((_resolve, reject) => {
        states.push({ name: request.file.name });
        request.signal.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      }),
    vi.fn(),
  );
  return uploads;
}

function render(props: Parameters<typeof RealisticState>[0]): readonly Seen[] {
  seen.length = 0;
  renderToStaticMarkup(createElement(RealisticState, props));
  return [...seen];
}

const of = (entries: readonly Seen[], kind: string): readonly Props[] =>
  entries.filter((entry) => entry.kind === kind).map((entry) => entry.props);

function isPress(value: unknown): value is () => void {
  return typeof value === 'function';
}

const texts = (entries: readonly Seen[]): readonly unknown[] =>
  of(entries, 'Text').map((props) => props.children);

function spz(name: string): {
  name: string;
  mime: string;
  bytes: number;
  preview: null;
  data: () => Promise<ArrayBuffer>;
  blob: () => Promise<Blob>;
} {
  return {
    name,
    mime: 'application/octet-stream',
    bytes: 288 * MB,
    preview: null,
    data: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob([])),
  };
}

describe('realistic body', () => {
  it('prompts without a scan, shows the upload card while one runs, and the scan otherwise', () => {
    expect(realisticBody({ ...SHOWN, scan: 'none', upload: IDLE })).toBe('prompt');
    expect(realisticBody({ ...SHOWN, scan: 'present', upload: IDLE })).toBe('scan');
    expect(realisticBody({ ...SHOWN, scan: 'present', upload: IDLE, webgl2: false })).toBe(
      'unsupported',
    );
    const failed = { kind: 'failed', name: 'a.spz', problem: 'stopped', detail: null } as const;
    expect(realisticBody({ ...SHOWN, scan: 'present', upload: failed })).toBe('upload');
  });

  it('waits for the scan link, then reports a scan that failed to load', () => {
    expect(realisticBody({ ...SHOWN, scan: 'present', upload: IDLE, linked: false })).toBe(
      'processing',
    );
    expect(
      realisticBody({ ...SHOWN, scan: 'present', upload: IDLE, loadFailed: 'answered 404' }),
    ).toBe('load-failed');
  });

  it('notices a missing file with Upload again', () => {
    const again = vi.fn();
    const notices = realisticNotices({ ...SHOWN, scan: 'missing', upload: IDLE }, again);
    expect(notices).toEqual([
      {
        icon: 'warning',
        text: 'The realistic view’s file is missing · Upload again',
        onPress: again,
      },
    ]);
    expect(realisticNotices({ ...SHOWN, scan: 'present', upload: IDLE }, again)).toEqual([]);
  });
});

describe('RealisticState', () => {
  const reload = vi.fn();
  const base = {
    ...SHOWN,
    mapId: 'map-1',
    mapName: 'Home',
    insets: { top: 0, bottom: 0 },
    offline: false,
    onReload: reload,
  } as const;

  it('draws the upload prompt with format chips, Choose a file and the help link', () => {
    const drawn = render({ ...base, uploads: uploadsWith([]), scan: 'none' });
    expect(texts(drawn)).toEqual([
      'Add a realistic view of Home',
      'Upload a gaussian splat scan of this map. You line it up with your rooms once, then it shows under the map.',
      '.ply',
      '.splat',
      '.spz',
    ]);
    expect(of(drawn, 'Button')).toEqual([
      expect.objectContaining({ label: 'Choose a file', disabled: false }),
      expect.objectContaining({ label: 'How to scan your home', href: SCAN_HELP_PATH }),
    ]);
  });

  it('places every state card between the measured top and bottom chrome', () => {
    const insets = { top: 120, bottom: 64 };
    const drawn = render({ ...base, insets, uploads: uploadsWith([]), scan: 'none' });
    expect(of(drawn, 'ScrollView')[0]?.['style']).toEqual({ top: 120, bottom: 64 });
  });

  it('draws progress with Cancel, and Cancel stops the upload', () => {
    const sent: Record<string, unknown>[] = [];
    const uploads = uploadsWith(sent);
    uploads.start('map-1', spz('home-scan.spz'));
    const uploading = render({ ...base, uploads, scan: 'none' });
    expect(texts(uploading)).toEqual([
      'Uploading home-scan.spz',
      '0% \u00b7 0 of 288 MB \u00b7 you can keep using the app',
    ]);
    expect(of(uploading, 'ProgressBar')).toEqual([expect.objectContaining({ progress: 0 })]);
    const cancel = of(uploading, 'Button')[0];
    expect(cancel).toMatchObject({ label: 'Cancel' });
    const press = cancel?.['onPress'];
    if (isPress(press)) press();
    expect(uploads.stateOf('map-1')).toEqual(IDLE);
    expect(sent).toHaveLength(1);
  });

  it('shows the unreadable error with Choose a file in the same card', () => {
    const uploads = uploadsWith([]);
    uploads.start('map-1', spz('holiday.jpg'));
    const drawn = render({ ...base, uploads, scan: 'present' });
    expect(texts(drawn)).toEqual(['holiday.jpg', 'This file isn’t a splat we can read']);
    expect(of(drawn, 'Button')).toEqual([expect.objectContaining({ label: 'Choose a file' })]);
    expect(of(drawn, 'IconButton')).toEqual([expect.objectContaining({ label: 'Close' })]);
  });

  it('says the realistic view is not available without WebGL2', () => {
    const drawn = render({ ...base, uploads: uploadsWith([]), scan: 'present', webgl2: false });
    expect(texts(drawn)).toEqual(['The realistic view isn’t available on this device']);
  });

  it('says the view is getting ready until the scan link arrives', () => {
    const drawn = render({ ...base, uploads: uploadsWith([]), scan: 'present', linked: false });
    expect(texts(drawn)).toEqual(['Getting the realistic view ready']);
  });

  it('shows a failed scan load with the detail, Try again and Upload again', () => {
    const drawn = render({
      ...base,
      uploads: uploadsWith([]),
      scan: 'present',
      loadFailed: 'The scan file answered 403',
    });
    expect(texts(drawn)).toEqual([
      'The realistic view couldn’t load',
      'The scan file answered 403',
    ]);
    const [again, upload] = of(drawn, 'Button');
    expect(again).toMatchObject({ label: 'Try again' });
    expect(upload).toMatchObject({ label: 'Upload again' });
    const press = again?.['onPress'];
    if (isPress(press)) press();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('draws nothing over a scan that is shown', () => {
    expect(render({ ...base, uploads: uploadsWith([]), scan: 'present' })).toEqual([]);
  });
});
