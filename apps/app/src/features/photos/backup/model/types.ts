export type MediaKind = 'photo' | 'video';

export interface MediaRow {
  readonly id: string;
  readonly filename: string;
  readonly kind: MediaKind;
  readonly creationTime: number | null;
  readonly modificationTime: number;
}

export interface MediaScope {
  readonly albumIds: readonly string[];
  readonly includeVideos: boolean;
}

export interface MediaStat {
  readonly id: string;
  readonly bytes: number;
  readonly mimeType: string;
  readonly relativePath: string;
  readonly dateAddedSeconds: number;
  readonly modifiedSeconds: number;
  readonly isTrashed: boolean;
  readonly isPending: boolean;
}

export type MediaAccess = 'all' | 'limited' | 'none';

export interface Conditions {
  readonly connected: boolean;
  readonly metered: boolean;
  readonly wifi: boolean;
  readonly charging: boolean;
}

export interface BackupDeviceIdentity {
  readonly deviceId: string;
  readonly name: string;
  readonly platform: 'android' | 'ios' | 'desktop';
}
