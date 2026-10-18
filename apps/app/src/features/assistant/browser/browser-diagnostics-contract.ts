import { z } from 'zod';
import type { BrowserTarget } from '@smarteverything/domain';

export type ConsoleLevel = 'error' | 'warning' | 'info' | 'debug';
export interface ConsoleRecord {
  readonly id: string;
  readonly time: string;
  readonly level: ConsoleLevel;
  readonly message: string;
  readonly source: string | null;
  readonly stack: string | null;
  readonly truncatedBytes: number;
}
export type PreviewSupport =
  | { readonly kind: 'available' }
  | { readonly kind: 'unavailable'; readonly reason: string; readonly waitForLayout?: boolean };
export interface PreviewViewScope {
  readonly clientId: string;
  readonly profileId: string;
  readonly chatId: string;
  readonly viewerId: string;
  readonly target: BrowserTarget;
}
export interface ConsolePage {
  readonly kind: 'ready';
  readonly documentId: string;
  readonly epoch: string;
  readonly records: readonly ConsoleRecord[];
  readonly errors: number;
  readonly previousCursor: string | null;
  readonly omittedRecords: number;
  readonly delivery: 'none' | 'pending' | 'shared' | 'failed';
}
export interface PreviewDiagnosticsSnapshot {
  readonly console: ConsolePage | { readonly kind: 'unavailable'; readonly reason: string };
  readonly capture: PreviewSupport;
  readonly captureCapability?: PreviewSupport;
  readonly clearCache: PreviewSupport;
  readonly clearCookies: PreviewSupport;
  readonly clearStorage: PreviewSupport;
}
export const PREVIEW_CAPTURE = z.object({
  artifactId: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  documentId: z.string().min(1),
  epoch: z.string().min(1),
});
export type PreviewCapture = z.infer<typeof PREVIEW_CAPTURE>;
export interface PreviewDocument {
  readonly documentId: string;
  readonly epoch: string;
}

export interface PreviewDiagnostics {
  readonly read: () => PreviewDiagnosticsSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly loadOlder: (cursor: string) => Promise<ConsolePage>;
  readonly capture: (expected?: PreviewDocument) => Promise<PreviewCapture>;
  readonly clearCache: (expected?: PreviewDocument) => Promise<void>;
  readonly clearStorage: (expected?: PreviewDocument) => Promise<void>;
  readonly clearCookies: (expected?: PreviewDocument) => Promise<void>;
  readonly setVisible: (visible: boolean) => void;
  readonly dispose: () => void;
}
