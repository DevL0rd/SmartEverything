import { closeSync, openSync, readSync } from 'node:fs';

const FIRST_SIZE = 4096;
const MAX_SIZE = 4 * 1024 * 1024;

export class KernelFileTooLargeError extends Error {
  override readonly name = 'KernelFileTooLargeError';

  constructor(path: string) {
    super(`${path} is larger than ${String(MAX_SIZE)} bytes.`);
  }
}

export class KernelFile {
  private descriptor: number | null = null;
  private buffer = Buffer.allocUnsafe(FIRST_SIZE);

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
      const length = readSync(descriptor, this.buffer, 0, this.buffer.length, 0);
      if (length < this.buffer.length) {
        return this.buffer.toString('utf8', 0, length);
      }
      this.grow();
    }
  }

  private grow(): void {
    const size = this.buffer.length * 2;
    if (size > MAX_SIZE) {
      throw new KernelFileTooLargeError(this.path);
    }
    this.buffer = Buffer.allocUnsafe(size);
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

  forget(keep: (path: string) => boolean): void {
    for (const [path, file] of this.files) {
      if (!keep(path)) {
        file.close();
        this.files.delete(path);
      }
    }
  }

  closeAll(): void {
    this.forget(() => false);
  }
}
