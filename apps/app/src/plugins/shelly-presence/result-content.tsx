import { TextExportButton } from './text-export-button';
import { valueSummary } from '../../components/schema-values';
import type { ShellyOperationResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../components/text';
import { ValueRow } from '../../components/rows';
import { List } from '../../components/section';

export function ContentResult({ result }: { readonly result: ShellyOperationResult }): ReactNode {
  if (result.kind.startsWith('kvs_')) return <StoredResult result={result} />;
  if (result.kind === 'script_code')
    return (
      <Text selectable className="font-mono" variant="callout">
        {result.value.code}
      </Text>
    );
  if (result.kind === 'script_eval') return <Text selectable>{result.value.result}</Text>;
  if (result.kind === 'device_logs') return <LogResult text={result.value.text} />;
  if (result.kind === 'http_request')
    return (
      <View className="gap-2">
        <Text variant="body-strong">
          HTTP {String(result.value.code)} · {result.value.message}
        </Text>
        <List title="Response headers">
          {Object.entries(result.value.headers).map(([key, value]) => (
            <ValueRow key={key} title={key} value={value} />
          ))}
        </List>
        <Text selectable className="font-mono" variant="callout">
          {result.value.body ?? result.value.body_b64 ?? 'No response body'}
        </Text>
      </View>
    );
  if (result.kind === 'changed')
    return result.value.id === undefined ? null : (
      <ValueRow title="Component ID" value={String(result.value.id)} />
    );
  return null;
}

function StoredResult({ result }: { readonly result: ShellyOperationResult }): ReactNode {
  if (result.kind === 'kvs_get')
    return <ValueRow title="Stored value" value={valueSummary(result.value.value)} />;
  if (result.kind === 'kvs_list')
    return (
      <List title="Matching keys">
        {Object.entries(result.value.keys).map(([key, entry]) => (
          <ValueRow key={key} title={key} value={entry.etag} />
        ))}
      </List>
    );
  if (result.kind === 'kvs_many')
    return (
      <List title="Matching stored values">
        {Object.entries(result.value.items).map(([key, entry]) => (
          <ValueRow key={key} title={key} value={valueSummary(entry.value)} />
        ))}
      </List>
    );
  return null;
}

function LogResult({ text }: { readonly text: string }): ReactNode {
  return (
    <View className="gap-3">
      <Text selectable className="font-mono" variant="callout">
        {text}
      </Text>
      <TextExportButton name="shelly-presence-logs.txt" title="Export device logs" content={text} />
    </View>
  );
}
