export type LocalMediaAccess = 'all' | 'limited' | 'none';

export interface LocalMediaItem {
  readonly id: string;
  readonly name: string;
  readonly takenAt: number;
  readonly modificationTime: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly video: boolean;
}

export interface LocalMediaSource {
  access(): Promise<LocalMediaAccess>;
  requestAccess(): Promise<LocalMediaAccess>;
  list(signal?: AbortSignal): Promise<readonly LocalMediaItem[]>;
  onChange(listener: () => void): () => void;
  issues(): readonly string[];
  resolve(id: string): Promise<string | null>;
}

export interface LocalLibraryState {
  readonly state: 'loading' | 'denied' | 'ready' | 'error' | 'unavailable';
  readonly access: LocalMediaAccess;
  readonly items: readonly LocalMediaItem[];
  readonly error: string | null;
}
