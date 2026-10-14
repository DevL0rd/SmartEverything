import { LogFilesResult } from './result-log-files';
import type { PresenceOperation } from './use-presence-operation';
import type { ShellyOperationResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { NetworkResult } from './result-network';
import { SystemResult } from './result-system';
import { ContentResult } from './result-content';
import { DynamicResult } from './result-dynamic';

const FAMILIES: Readonly<
  Record<ShellyOperationResult['kind'], 'network' | 'system' | 'content' | 'dynamic' | 'logs'>
> = {
  device_log_files: 'logs',
  device_log_file: 'logs',
  kvs_get: 'content',
  kvs_list: 'content',
  kvs_many: 'content',
  script_library: 'content',
  script_example: 'content',
  firmware_upload_write: 'system',
  firmware_alternatives: 'system',
  cloud_relay_list: 'network',
  cloud_relay_infos: 'network',
  wifi_scan: 'network',
  wifi_clients: 'network',
  ble_clients: 'network',
  matter_setup: 'network',
  schedule_eval: 'system',
  device_timezones: 'system',
  device_detect_location: 'system',
  device_profiles: 'system',
  firmware_check: 'system',
  script_code: 'content',
  script_eval: 'content',
  device_logs: 'content',
  http_request: 'content',
  changed: 'content',
  bthome_objects: 'dynamic',
  bthome_known_objects: 'dynamic',
};

export function OperationResult({
  result,
  run,
}: {
  readonly result: ShellyOperationResult | null;
  readonly run: PresenceOperation['run'];
}): ReactNode {
  if (result === null) return null;
  switch (FAMILIES[result.kind]) {
    case 'logs':
      return <LogFilesResult result={result} run={run} />;
    case 'network':
      return <NetworkResult result={result} />;
    case 'system':
      return <SystemResult result={result} />;
    case 'content':
      return <ContentResult result={result} />;
    case 'dynamic':
      return <DynamicResult result={result} />;
  }
}
