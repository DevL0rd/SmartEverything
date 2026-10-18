import { fsCode } from '../../../fs-code';

const GONE: readonly string[] = ['ENOENT', 'ENOTDIR'];

export const UNREADABLE: readonly string[] = [...GONE, 'EACCES', 'EPERM'];

export async function orElse<T>(
  work: Promise<T>,
  fallback: T,
  codes: readonly string[] = GONE,
): Promise<T> {
  try {
    return await work;
  } catch (cause) {
    const code = fsCode(cause);
    if (code !== undefined && codes.includes(code)) {
      return fallback;
    }
    throw cause;
  }
}
