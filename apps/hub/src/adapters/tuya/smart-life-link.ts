import { setTimeout as sleep } from 'node:timers/promises';
import type { ProviderProblem } from '@smarteverything/domain';
import {
  TuyaCloudError,
  loginResultUrl,
  qrContent,
  qrTokenUrl,
  readLoginReply,
  readQrToken,
  type SmartLifeSession,
} from '@smarteverything/tuya';
import { ProviderProblemError, type LinkContext } from '../contract';
import { readJson } from './smart-life-cloud';
import type { TuyaDependencies } from './dependencies';

const SMART_LIFE_APP = 'Smart Life or Tuya Smart';

type LoginDependencies = Pick<TuyaDependencies, 'fetch' | 'now' | 'timing'>;

class QrScanTimeoutError extends Error {
  override readonly name = 'QrScanTimeoutError';
  readonly problem: ProviderProblem = 'qr_expired';

  constructor(timeoutMs: number) {
    super(
      `The QR code was not scanned and confirmed in the ${SMART_LIFE_APP} app within ${String(timeoutMs / 60_000)} minutes. Start the sign-in again for a new code.`,
    );
  }
}

class QrSignInWithdrawnError extends Error {
  override readonly name = 'QrSignInWithdrawnError';
  readonly problem: ProviderProblem = 'cancelled';

  constructor(override readonly cause: unknown) {
    super('The Smart Life sign-in was cancelled before the QR code was confirmed.');
  }
}

class UserCodeRejectedError extends Error {
  override readonly name = 'UserCodeRejectedError';

  constructor(override readonly cause: TuyaCloudError) {
    super(
      'That User Code did not work. Copy it again from Smart Life: Me > Settings > Account and Security > User Code. Capital letters matter.',
    );
  }
}

async function requestQrCode(dependencies: LoginDependencies, userCode: string): Promise<string> {
  const operation = 'requesting a Smart Life QR code';
  const response = await dependencies.fetch(qrTokenUrl(userCode), { method: 'POST' });
  try {
    return readQrToken(await readJson(operation, response));
  } catch (cause) {
    if (cause instanceof TuyaCloudError) {
      throw new ProviderProblemError('bad_credentials', new UserCodeRejectedError(cause));
    }
    throw cause;
  }
}

async function checkScan(
  dependencies: LoginDependencies,
  query: { readonly qrToken: string; readonly userCode: string },
  signal: AbortSignal,
): Promise<SmartLifeSession | null> {
  const operation = 'checking the Smart Life QR sign-in';
  const response = await dependencies.fetch(loginResultUrl(query.qrToken, query.userCode), {
    method: 'GET',
    signal,
  });
  const reply = readLoginReply(await readJson(operation, response), query.userCode);
  return reply.kind === 'signed_in' ? reply.session : null;
}

async function awaitScan(
  dependencies: LoginDependencies,
  query: { readonly qrToken: string; readonly userCode: string },
  signal: AbortSignal,
): Promise<SmartLifeSession> {
  const { qrScanQueryMs, qrScanTimeoutMs } = dependencies.timing;
  const deadline = dependencies.now() + qrScanTimeoutMs;
  for (;;) {
    signal.throwIfAborted();
    if (dependencies.now() >= deadline) {
      throw new QrScanTimeoutError(qrScanTimeoutMs);
    }
    const session = await checkScan(dependencies, query, signal);
    if (session !== null) {
      return session;
    }
    try {
      await sleep(qrScanQueryMs, undefined, { signal });
    } catch (cause) {
      signal.throwIfAborted();
      throw cause;
    }
  }
}

export async function signInWithUserCode(
  userCode: string,
  dependencies: LoginDependencies,
  context: LinkContext,
): Promise<SmartLifeSession> {
  const qrToken = await requestQrCode(dependencies, userCode);
  const issuedAt = dependencies.now();
  const shown = await context.show({
    kind: 'scan_qr',
    app: SMART_LIFE_APP,
    content: qrContent(qrToken),
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(issuedAt + dependencies.timing.qrScanTimeoutMs).toISOString(),
  });
  const withdrawn = new AbortController();
  shown.answer.then(
    () => {
      withdrawn.abort(new QrSignInWithdrawnError('the QR prompt was answered'));
    },
    (cause: unknown) => {
      withdrawn.abort(new QrSignInWithdrawnError(cause));
    },
  );
  context.log.info('tuya.qr_scan_awaited', {
    intervalMs: dependencies.timing.qrScanQueryMs,
    reason: 'Tuya reports a confirmed QR sign-in only when its login result is queried',
  });
  try {
    const session = await awaitScan(dependencies, { qrToken, userCode }, withdrawn.signal);
    context.log.info('tuya.smart_life_signed_in', { endpoint: session.endpoint });
    return session;
  } finally {
    await shown.dismiss();
  }
}
