import { ApiError, type JsonValue, type ShellyPresenceAction } from '@smarteverything/domain';
import { redactText } from '@smarteverything/logging';
import { authenticatedShellyFile, boundedText, type ShellyHttpOptions } from './http';
interface SavedLog {
  readonly name: string;
  readonly path: string;
}
export async function savedShellyLog(
  action: ShellyPresenceAction,
  options: ShellyHttpOptions,
): Promise<JsonValue | undefined> {
  if (action.action !== 'device_log_files' && action.action !== 'device_log_file') return undefined;
  const files = await logFiles(options);
  if (action.action === 'device_log_files')
    return { files: files.map((file) => ({ name: file.name, path: file.path })) };
  const file = files.find((candidate) => candidate.path === action.path);
  if (file === undefined)
    throw new ApiError('not_found', 'That path is not listed by this sensor as a saved log file.');
  const response = await authenticatedShellyFile(options, new URL(file.path, options.address));
  return { name: file.name, text: redactText(await boundedText(response), 262144) };
}
async function logFiles(options: ShellyHttpOptions): Promise<readonly SavedLog[]> {
  const response = await authenticatedShellyFile(options, new URL('/debug/logs', options.address));
  const text = await boundedText(response);
  const files = new Map<string, SavedLog>();
  for (const match of text.matchAll(
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"<>]{1,500})"|'([^'<>]{1,500})'|([^\s<>]{1,500}))/gi,
  )) {
    const href = match[1] ?? match[2] ?? match[3];
    if (href === undefined) continue;
    const file = listedLog(href, options.address);
    if (file !== null) files.set(file.path, file);
    if (files.size >= 64) break;
  }
  return [...files.values()];
}
function listedLog(href: string, address: string): SavedLog | null {
  try {
    const url = new URL(href.replaceAll('&amp;', '&'), new URL('/debug/logs', address));
    if (!logUrlAllowed(url, address)) return null;
    const name = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
    if (name === '') return null;
    return { name: name.slice(0, 300), path: url.pathname };
  } catch (cause) {
    if (cause instanceof URIError || cause instanceof TypeError) return null;
    throw cause;
  }
}

function logUrlAllowed(url: URL, address: string): boolean {
  return (
    url.origin === new URL(address).origin &&
    url.pathname.startsWith('/debug/') &&
    url.pathname !== '/debug/logs' &&
    url.hash === '' &&
    url.search === ''
  );
}
