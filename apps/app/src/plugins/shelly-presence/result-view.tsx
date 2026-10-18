import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { CopyField } from '../../components/copy-field';
import { NavRow, ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { arrayOf } from '../../components/schema-values';
import { recordOf } from './form-model';
import type { PresenceRequest } from './presence-operation';
import { TextExportButton } from './text-export-button';
import { background } from '@smarteverything/logging';

const TYPED_RESULT = z.union([
  z
    .object({ text: z.string(), name: z.string().optional() })
    .transform((log) => ({ kind: 'log' as const, text: log.text, name: log.name })),
  z
    .object({ files: z.array(z.object({ name: z.string(), path: z.string() })) })
    .transform((logs) => ({ kind: 'files' as const, files: logs.files })),
  z
    .object({
      results: z.array(
        z.object({
          ssid: z.string().nullish(),
          bssid: z.string(),
          rssi: z.number(),
          channel: z.number(),
        }),
      ),
    })
    .transform((scan) => ({ kind: 'networks' as const, networks: scan.results })),
  z.object({ manual_code: z.string(), qr_code: z.string() }).transform((setup) => ({
    kind: 'matter' as const,
    code: setup.manual_code,
    qr: setup.qr_code,
  })),
]);

export function typedResult(result: JsonValue): z.output<typeof TYPED_RESULT> | null {
  const parsed = TYPED_RESULT.safeParse(result);
  return parsed.success ? parsed.data : null;
}

interface ResultProps {
  readonly result: JsonValue | null;
  readonly run: (request: PresenceRequest) => Promise<boolean>;
}

function scalarText(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function ValueTree({ value }: { readonly value: JsonValue }): ReactNode {
  if (Array.isArray(value))
    return (
      <View className="gap-3">
        {arrayOf(value).map((entry, index) => (
          <ValueTree key={index} value={entry} />
        ))}
      </View>
    );
  const record = recordOf(value);
  if (record === null)
    return (
      <Text selectable className="font-mono" variant="callout">
        {scalarText(value)}
      </Text>
    );
  const nested = Object.entries(record).filter(
    ([, entry]) => typeof entry === 'object' && entry !== null,
  );
  return (
    <View className="gap-3">
      <List>
        {Object.entries(record)
          .filter(([, entry]) => typeof entry !== 'object' || entry === null)
          .map(([key, entry]) => (
            <ValueRow key={key} title={key} value={scalarText(entry)} />
          ))}
      </List>
      {nested.map(([key, entry]) => (
        <View key={key} className="gap-2">
          <Text variant="body-strong">{key}</Text>
          <ValueTree value={entry} />
        </View>
      ))}
    </View>
  );
}

function LogText({ text, name }: { readonly text: string; readonly name: string }): ReactNode {
  return (
    <View className="gap-3">
      <Text selectable className="font-mono" variant="callout">
        {text}
      </Text>
      <TextExportButton name={name} title="Export" content={text} />
    </View>
  );
}

function TypedView({
  typed,
  run,
}: {
  readonly typed: NonNullable<ReturnType<typeof typedResult>>;
  readonly run: ResultProps['run'];
}): ReactNode {
  if (typed.kind === 'log')
    return <LogText text={typed.text} name={typed.name ?? 'shelly-log.txt'} />;
  if (typed.kind === 'files')
    return (
      <List title="Saved device logs">
        {typed.files.map((file) => (
          <NavRow
            key={file.path}
            title={file.name}
            onPress={() => {
              background(
                run({ action: 'device_log_file', params: { path: file.path } }),
                'result_view.run_failed',
              );
            }}
          />
        ))}
      </List>
    );
  if (typed.kind === 'networks')
    return (
      <List title="Nearby networks">
        {typed.networks.map((network) => (
          <ValueRow
            key={network.bssid}
            title={network.ssid ?? 'Hidden network'}
            value={`${String(network.rssi)} dBm · channel ${String(network.channel)}`}
          />
        ))}
      </List>
    );
  return (
    <View className="gap-3">
      <CopyField label="Matter pairing code" value={typed.code} />
      <CopyField label="Matter QR payload" value={typed.qr} />
    </View>
  );
}

export function ResultView({ result, run }: ResultProps): ReactNode {
  if (result === null) return null;
  const typed = typedResult(result);
  return typed === null ? <ValueTree value={result} /> : <TypedView typed={typed} run={run} />;
}
