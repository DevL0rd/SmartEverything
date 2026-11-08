import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { z } from 'zod';

const OPTIONAL_ENV = z.string().optional();
const CAPTURED_TEXT = z.string({ error: 'the command produced no captured text' });

const RELEASE_JAVA_HOME = '/usr/lib/jvm/java-21-openjdk';

export function androidHome(): string {
  return OPTIONAL_ENV.parse(env['ANDROID_HOME']) ?? join(homedir(), 'Android', 'Sdk');
}

export function javaHome(): string {
  return OPTIONAL_ENV.parse(env['JAVA_HOME']) ?? RELEASE_JAVA_HOME;
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
