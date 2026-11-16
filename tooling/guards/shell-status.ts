export type ReadAppFile = (path: string) => string;

export interface AppSource {
  readonly path: string;
  readonly text: string;
}

const ROOT_LAYOUT = 'app/_layout.tsx';

const NOTICE = 'src/app-shell/connection-notice.tsx';

const HOST = /<ConnectionNoticeHost\s*\/>/gu;

const MOUNTED_AT_ROOT =
  /<BackRulesProvider\b[^>]*>\s*<ConnectionNoticeHost \/>\s*<Stack\b[\s\S]*<\/Stack>\s*<\/BackRulesProvider>/u;

export function noticeHostGaps(
  read: ReadAppFile,
  sources: readonly AppSource[],
): readonly string[] {
  const gaps: string[] = [];
  const root = read(ROOT_LAYOUT);
  if (!MOUNTED_AT_ROOT.test(root)) {
    gaps.push(`${ROOT_LAYOUT}: the connection notice host is not mounted above the root stack`);
  }
  const mounts = sources.flatMap((source) =>
    [...source.text.matchAll(HOST)].map(() => source.path),
  );
  if (mounts.length !== 1 || mounts[0] !== ROOT_LAYOUT) {
    gaps.push(`the connection notice host is mounted in ${mounts.join(', ') || 'no file'}`);
  }
  if (/<HeaderStatusProvider\b/u.test(root)) {
    gaps.push(`${ROOT_LAYOUT}: the root puts a status into every bar`);
  }
  return gaps;
}

const STATUS_HOME = 'src/components/page-shell/shell-actions.tsx';

const CONNECTION_IN_BAR =
  /\b(?:SyncIndicator|ConnectionNoticeHost|useConnection|useSyncStatus|useUpdateNoticeShown)\b/u;

function barFile(path: string): boolean {
  return path.startsWith('src/components/page-shell/') || path === 'src/components/flow-frame.tsx';
}

export function barStatusGaps(sources: readonly AppSource[]): readonly string[] {
  return sources.flatMap((source) => {
    const gaps: string[] = [];
    const slots = [...source.text.matchAll(/<ShellStatus\b/gu)].length;
    const allowed = source.path === STATUS_HOME ? 1 : 0;
    if (slots !== allowed) gaps.push(`${source.path}: draws a status slot in a bar`);
    if (barFile(source.path) && CONNECTION_IN_BAR.test(source.text)) {
      gaps.push(`${source.path}: a bar reads the connection`);
    }
    if (/\bSyncIndicator\b/u.test(source.text)) gaps.push(`${source.path}: uses SyncIndicator`);
    return gaps;
  });
}

export function quietNoticeGaps(read: ReadAppFile): readonly string[] {
  const text = read(NOTICE);
  const gaps: string[] = [];
  if (!/case 'live':\s*return sync\.failed\.length === 0 \? null\b/u.test(text)) {
    gaps.push(`${NOTICE}: a live connection with every section readable shows a notice`);
  }
  if (!text.includes('if (useUpdateNoticeShown()) return null;')) {
    gaps.push(`${NOTICE}: the connection notice does not give way to an update notice`);
  }
  if (text.includes("'positive'") || text.includes('Connected to your server')) {
    gaps.push(`${NOTICE}: the notice announces a healthy connection`);
  }
  return gaps;
}
