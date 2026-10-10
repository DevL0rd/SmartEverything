export type PickSource = 'camera' | 'photos' | 'files';

export interface PickedFile {
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  readonly preview: string | null;
  readonly data: () => Promise<ArrayBuffer>;
}

export class PickerMissingError extends Error {
  override readonly name = 'PickerMissingError';
}

const ACCEPT: Readonly<Record<PickSource, string>> = {
  camera: 'image/*',
  photos: 'image/*',
  files: '*/*',
};

function pickedOf(file: File): PickedFile {
  return {
    name: file.name,
    mime: file.type === '' ? 'application/octet-stream' : file.type,
    bytes: file.size,
    preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    data: () => file.arrayBuffer(),
  };
}

function listOf(files: FileList | null | undefined): readonly PickedFile[] {
  return files === null || files === undefined ? [] : Array.from(files, pickedOf);
}

export function pickFiles(source: PickSource): Promise<readonly PickedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = ACCEPT[source];
    if (source === 'camera') {
      input.setAttribute('capture', 'environment');
    }
    input.addEventListener('change', () => {
      resolve(listOf(input.files));
    });
    input.addEventListener('cancel', () => {
      resolve([]);
    });
    input.click();
  });
}

export function filesOfTransfer(transfer: unknown): readonly PickedFile[] {
  return transfer instanceof DataTransfer ? listOf(transfer.files) : [];
}
