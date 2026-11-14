import { env } from 'node:process';
import { z } from 'zod';
import { BuildHostError } from './build-host.ts';

const OPTIONAL_ENV = z.string().optional();
const CAPTURED_TEXT = z.string({ error: 'the command produced no captured text' });

function requiredHome(name: 'ANDROID_HOME' | 'JAVA_HOME'): string {
  const value = OPTIONAL_ENV.parse(env[name]);
  if (value === undefined || value === '')
    throw new BuildHostError([
      `${name} is not set: provision the build host with tooling/provision-build-host.ts, or export ${name} on a development machine`,
    ]);
  return value;
}

export function androidHome(): string {
  return requiredHome('ANDROID_HOME');
}

export function javaHome(): string {
  return requiredHome('JAVA_HOME');
}

export function releaseServer(): string | undefined {
  return OPTIONAL_ENV.parse(env['EXPO_PUBLIC_SERVER_URL']);
}

export function releaseCommandEnvironment(
  overrides: Readonly<Record<string, string>>,
): NodeJS.ProcessEnv {
  return { ...env, ...overrides };
}

export function capturedText(value: unknown): string {
  return CAPTURED_TEXT.parse(value);
}
