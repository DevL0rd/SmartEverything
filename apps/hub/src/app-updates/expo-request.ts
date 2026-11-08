import { APP_UPDATE_EXTRA_PARAMS, ApiError, type AppUpdateChannel } from '@smarteverything/domain';
import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { SfvDictionaryError, stringDictionaryOf } from './sfv-dictionary';

const EXTRA_PARAMS_HEADER = 'expo-extra-params';

const EXTRA_PARAMS = APP_UPDATE_EXTRA_PARAMS.partial({ key: true });

const HEADERS = z.object({
  'expo-protocol-version': z.literal('1'),
  'expo-platform': z.literal('android'),
  'expo-runtime-version': z.string().min(1),
  'expo-current-update-id': z.uuid().optional(),
  'expo-expect-signature': z.string().optional(),
  [EXTRA_PARAMS_HEADER]: z.string(),
});

export interface ExpoRequest {
  readonly runtimeVersion: string;
  readonly channel: AppUpdateChannel;
  readonly key: string | null;
  readonly download: string | null;
  readonly currentUpdateId: string | null;
  readonly expectsSignature: boolean;
}

function shown(name: string, value: string | readonly string[] | undefined): string {
  if (value === undefined) return 'no header';
  if (typeof value !== 'string') return 'the header more than once';
  return name === EXTRA_PARAMS_HEADER ? 'an unreadable value' : JSON.stringify(value);
}

function invalid(request: IncomingMessage, name: string, message: string): ApiError {
  return new ApiError(
    'invalid_request',
    `The header ${name} is not valid: ${message}.`,
    `received ${shown(name, request.headers[name])}`,
  );
}

function paramsOf(request: IncomingMessage, header: string): z.infer<typeof EXTRA_PARAMS> {
  try {
    const parsed = EXTRA_PARAMS.safeParse(stringDictionaryOf(header));
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    const where = issue?.path.join('.') ?? 'the params';
    throw invalid(request, EXTRA_PARAMS_HEADER, `${where} ${issue?.message ?? 'is unreadable'}`);
  } catch (cause) {
    if (cause instanceof SfvDictionaryError) {
      throw invalid(request, EXTRA_PARAMS_HEADER, cause.message);
    }
    throw cause;
  }
}

export function parseExpoRequest(request: IncomingMessage): ExpoRequest {
  const received = Object.fromEntries(
    Object.keys(HEADERS.shape).map((name) => [name, request.headers[name]]),
  );
  const parsed = HEADERS.safeParse(received);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw invalid(
      request,
      String(issue?.path[0] ?? 'expo headers'),
      issue?.message ?? 'unreadable',
    );
  }
  const headers = parsed.data;
  const params = paramsOf(request, headers[EXTRA_PARAMS_HEADER]);
  return {
    runtimeVersion: headers['expo-runtime-version'],
    channel: params.channel,
    key: params.key ?? null,
    download: params.download ?? null,
    currentUpdateId: headers['expo-current-update-id'] ?? null,
    expectsSignature: headers['expo-expect-signature'] !== undefined,
  };
}
