import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { Snapshot } from '@smarteverything/domain';
import type { TablesScope } from '../api/connection/client';
import type { SectionFailure } from './state';
import { api } from '../api/transport';

const REQUEST = {
  query: { nutrition: true, watch: true, weather: true, talk: true, assistant: true },
};

const SCOPE: TablesScope = { roots: ['tables', 'owner'], sections: ['firewall'] };

export interface LiveSnapshot {
  readonly snapshot: Snapshot;
  readonly failed: readonly SectionFailure[];
}

export async function readLiveSnapshot(): Promise<LiveSnapshot> {
  const read = await api().callTables(E.readSnapshot, REQUEST, SCOPE);
  return { snapshot: read.data, failed: read.failed };
}
