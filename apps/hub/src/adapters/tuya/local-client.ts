export interface LocalClientOptions {
  readonly id: string;
  readonly key: string;
  readonly ip: string;
  readonly port: number;
  readonly version: string;
}

export type LocalValue = string | number | boolean;

interface LocalSetOptions {
  readonly multiple: true;
  readonly data: Record<string, LocalValue>;
  readonly shouldWaitForResponse: false;
  readonly cid?: string;
}

interface LocalGetOptions {
  readonly schema: true;
  readonly cid?: string;
}

export interface LocalClient {
  connect(): Promise<boolean>;
  disconnect(): void;
  get(options: LocalGetOptions): Promise<unknown>;
  set(options: LocalSetOptions): Promise<unknown>;
  on(event: 'connected' | 'disconnected', listener: () => void): unknown;
  on(event: 'error', listener: (error: unknown) => void): unknown;
  on(
    event: 'data' | 'dp-refresh',
    listener: (payload: unknown, commandByte: number) => void,
  ): unknown;
}
