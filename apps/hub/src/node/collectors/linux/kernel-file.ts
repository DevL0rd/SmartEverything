import { closeSync, openSync, readSync } from 'node:fs';

const FIRST_SIZE = 4096;
const MAX_SIZE = 4 * 1024 * 1024;

export class KernelFileTooLargeError extends Error {
  override readonly name = 'KernelFileTooLargeError';

  constructor(path: string) {
    super(`${path} is larger than ${String(MAX_SIZE)} bytes.`);
  }
}

let scratch = Buffer.allocUnsafeSlow(FIRST_SIZE);

export class KernelFile {
  private descriptor: number | null = null;

  constructor(readonly path: string) {}

  read(): string {
    try {
      return this.readOpen();
    } catch (cause) {
      this.close();
      throw cause;
    }
  }

  close(): void {
    if (this.descriptor !== null) {
      closeSync(this.descriptor);
      this.descriptor = null;
    }
  }

  private readOpen(): string {
    const descriptor = this.descriptor ?? openSync(this.path, 'r');
    this.descriptor = descriptor;
    for (;;) {
      const length = readSync(descriptor, scratch, 0, scratch.length, 0);
      if (length < scratch.length) {
        return scratch.toString('utf8', 0, length);
      }
      this.grow();
    }
  }

  private grow(): void {
    const size = scratch.length * 2;
    if (size > MAX_SIZE) {
      throw new KernelFileTooLargeError(this.path);
    }
    scratch = Buffer.allocUnsafeSlow(size);
  }
}

export class KernelFiles {
  private readonly files = new Map<string, KernelFile>();

  read(path: string): string {
    const known = this.files.get(path);
    const file = known ?? new KernelFile(path);
    if (known === undefined) {
      this.files.set(path, file);
    }
    try {
      return file.read();
    } catch (cause) {
      this.files.delete(path);
      throw cause;
    }
  }

  drop(path: string): void {
    this.files.get(path)?.close();
    this.files.delete(path);
  }

  closeAll(): void {
    for (const file of this.files.values()) {
      file.close();
    }
    this.files.clear();
  }
}
