export interface TapFailure {
  readonly file: string;
  readonly test: string;
}

export interface TapSummary {
  readonly passed: number;
  readonly failed: number;
  readonly notRun: number;
  readonly failures: readonly TapFailure[];
  readonly result: 'PASS' | 'FAIL' | 'UNKNOWN';
}

export interface KnownLimit {
  readonly name: string;
  readonly reason: string;
  readonly tests: readonly string[];
}

export const KNOWN_LIMITS: readonly KnownLimit[] = [
  {
    name: 'Device nodes',
    reason:
      'The rig runs in a user namespace without CAP_MKNOD in the initial namespace, so block and character nodes cannot be created; the suite substitutes FIFOs and the explicit mknod b and c cases fail with EPERM.',
    tests: [
      'link/00.t',
      'mknod/02.t',
      'mknod/03.t',
      'mknod/11.t',
      'rename/00.t',
      'rename/13.t',
      'rename/14.t',
      'rename/23.t',
      'unlink/00.t',
      'unlink/11.t',
    ],
  },
];

export function limitOf(file: string): KnownLimit | undefined {
  return KNOWN_LIMITS.find((limit) => limit.tests.some((test) => file.endsWith(`/${test}`)));
}

const FILE_LINE = /^(\S+\.t) \.{2,}/u;
const NOT_OK = /^not ok \d+(?: - (.*))?$/u;
const OK = /^ok \d+(.*)$/u;
const SKIP = /# skip/iu;
const TODO = /# todo/iu;

export function parseTap(text: string): TapSummary {
  let file = '';
  let passed = 0;
  let failed = 0;
  let notRun = 0;
  let result: TapSummary['result'] = 'UNKNOWN';
  const failures: TapFailure[] = [];
  for (const line of text.split('\n')) {
    const header = FILE_LINE.exec(line);
    if (header?.[1] !== undefined) file = header[1];
    const bad = NOT_OK.exec(line);
    if (bad !== null) {
      if (TODO.test(line)) continue;
      failed += 1;
      failures.push({ file, test: line });
      continue;
    }
    const good = OK.exec(line);
    if (good !== null) {
      if (SKIP.test(line)) notRun += 1;
      else passed += 1;
      continue;
    }
    if (line.startsWith('Result: PASS')) result = 'PASS';
    else if (line.startsWith('Result: FAIL')) result = 'FAIL';
  }
  return { passed, failed, notRun, failures, result };
}

export interface XfstestsSummary {
  readonly ran: readonly string[];
  readonly notRun: readonly string[];
  readonly failures: readonly string[];
}

function names(line: string, label: string): readonly string[] {
  return line
    .slice(label.length)
    .split(/\s+/u)
    .filter((entry) => entry !== '');
}

export function parseCheck(text: string): XfstestsSummary {
  let ran: readonly string[] = [];
  let notRun: readonly string[] = [];
  let failures: readonly string[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('Ran: ')) ran = names(line, 'Ran: ');
    else if (line.startsWith('Not run: ')) notRun = names(line, 'Not run: ');
    else if (line.startsWith('Failures: ')) failures = names(line, 'Failures: ');
  }
  return { ran, notRun, failures };
}

export interface FsxRun {
  readonly label: string;
  readonly exitCode: number;
  readonly tail: string;
}
