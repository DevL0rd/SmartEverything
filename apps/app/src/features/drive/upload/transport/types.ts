import type { DriveUploadTarget } from '@smarteverything/domain';

export interface ContentUploadSource {
  readonly uri: string;
  readonly size: number;
  readonly type: string;
}

export interface UploadRequest {
  readonly identity: string;
  readonly source: Blob | ContentUploadSource;
  readonly name: string;
  readonly target: DriveUploadTarget;
  readonly sha256?: string;
}

export type UploadFailure =
  | { readonly kind: 'over-quota' }
  | { readonly kind: 'no-space' }
  | { readonly kind: 'read-only-root' }
  | { readonly kind: 'session-refused' }
  | { readonly kind: 'session-expired' }
  | { readonly kind: 'hub-unreachable'; readonly reason: string }
  | { readonly kind: 'rejected'; readonly status: number; readonly message: string }
  | { readonly kind: 'client-error'; readonly message: string };

export type UploadOutcome =
  | {
      readonly kind: 'done';
      readonly itemId: string;
      readonly name: string;
      readonly renamed: boolean;
    }
  | { readonly kind: 'already-have'; readonly itemId: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly failure: UploadFailure };

export interface UploadHandle {
  readonly id: string;
  readonly outcome: Promise<UploadOutcome>;
  pause(): Promise<void>;
  resume(): void;
  cancel(): Promise<void>;
}

export interface TransportRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Blob | null;
  readonly signal: AbortSignal;
}

export interface TransportAnswer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface UploadTransport {
  send(request: TransportRequest): Promise<TransportAnswer>;
}
