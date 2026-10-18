import { ApiError, JSON_VALUE } from '@smarteverything/domain';
import type { ShellyAction } from '@smarteverything/shelly';
import { redactText } from '@smarteverything/logging';
import { z } from 'zod';
import { authenticatedShellyGet, readBounded, shellyHttp } from './http';
import type { OperationHandler, OperationPorts } from './ports';

const LIBRARY_ROOT = 'https://raw.githubusercontent.com/ALLTERCO/shelly-script-examples/main/';
const LIBRARY_BYTES = 524288;
const LOG_BYTES = 262144;
const LOG_LINES = 100;
const LOGS = z.object({ lines: z.int().positive().default(LOG_LINES) });
const LOG_PATH = z.object({ path: z.string().startsWith('/debug/') });
const EXAMPLE = z.object({ fname: z.string() });

async function library(ports: OperationPorts, file: string, limit: number): Promise<string> {
  const response = await shellyHttp(new URL(file, LIBRARY_ROOT), {
    signal: ports.http().signal,
    tls: null,
  });
  if (!response.ok)
    throw new ApiError(
      'upstream_failed',
      `The script library answered HTTP ${String(response.status)}.`,
    );
  return readBounded(response, limit);
}

const scriptLibrary: OperationHandler = async (ports) => {
  const raw: unknown = JSON.parse(await library(ports, 'examples-manifest.json', LIBRARY_BYTES));
  return { examples: JSON_VALUE.parse(raw) };
};

const scriptExample: OperationHandler = async (ports, params) => {
  const { fname } = EXAMPLE.parse(params);
  return { fname, code: await library(ports, fname, LIBRARY_BYTES) };
};

async function logText(ports: OperationPorts, path: string): Promise<string> {
  const options = ports.http();
  const url = new URL(path, options.address);
  if (url.origin !== new URL(options.address).origin || !url.pathname.startsWith('/debug/'))
    throw new ApiError('invalid_request', 'Only the sensor debug logs can be read.');
  return readBounded(await authenticatedShellyGet(options, url), LOG_BYTES);
}

const deviceLogs: OperationHandler = async (ports, params) => {
  const { lines } = LOGS.parse(params);
  return { text: redactText(await logText(ports, `/debug/log?n=${String(lines)}&f=0`), LOG_BYTES) };
};

function logFilesIn(page: string): readonly { readonly name: string; readonly path: string }[] {
  const paths = new Set<string>();
  for (const match of page.matchAll(/<a\b[^>]*\bhref\s*=\s*["']?([^"'\s<>]+)/gi)) {
    const path = new URL((match[1] ?? '').replaceAll('&amp;', '&'), 'http://device/debug/logs')
      .pathname;
    if (path.startsWith('/debug/') && path !== '/debug/logs') paths.add(path);
  }
  return [...paths].map((path) => ({
    name: decodeURIComponent(path.split('/').at(-1) ?? ''),
    path,
  }));
}

const deviceLogFiles: OperationHandler = async (ports) => ({
  files: logFilesIn(await logText(ports, '/debug/logs')),
});

const deviceLogFile: OperationHandler = async (ports, params) => {
  const { path } = LOG_PATH.parse(params);
  return {
    name: decodeURIComponent(path.split('/').at(-1) ?? ''),
    text: redactText(await logText(ports, path), LOG_BYTES),
  };
};

export const READ_HANDLERS = {
  script_library: scriptLibrary,
  script_example: scriptExample,
  device_logs: deviceLogs,
  device_log_files: deviceLogFiles,
  device_log_file: deviceLogFile,
} satisfies Partial<Record<ShellyAction, OperationHandler>>;
