const NO_PERMISSION = 'ERR_NO_PERMISSION';

export function isClipboardRefused(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && Reflect.get(error, 'code') === NO_PERMISSION
  );
}
