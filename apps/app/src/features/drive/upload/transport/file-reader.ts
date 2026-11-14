import type { TusFileReader } from './tus-types';

export const blobFileReader: TusFileReader = {
  openFile(input: unknown) {
    if (!(input instanceof Blob)) {
      return Promise.reject(new TypeError('An upload source must be a Blob.'));
    }
    return Promise.resolve({
      size: input.size,
      slice: (start: number, end: number) =>
        Promise.resolve({ value: input.slice(start, end), done: end >= input.size }),
      close: (): void => undefined,
    });
  },
};
