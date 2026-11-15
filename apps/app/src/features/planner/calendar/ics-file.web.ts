import { PLANNER_ICS_CONTENT_TYPE } from '@smarteverything/domain';

export function pickIcsFile(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `.ics,${PLANNER_ICS_CONTENT_TYPE}`;
    input.addEventListener('change', () => {
      resolve(input.files?.item(0) ?? null);
    });
    input.addEventListener('cancel', () => {
      resolve(null);
    });
    input.click();
  });
}

export function saveIcsFile(name: string, bytes: Uint8Array): Promise<void> {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: PLANNER_ICS_CONTENT_TYPE }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
  return Promise.resolve();
}
