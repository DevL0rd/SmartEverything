import type { ReactNode } from 'react';
import { Text as NativeText, View } from 'react-native';
import { Badge, type BadgeTone } from '../../../components/badge';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { CopyButton } from '../../../components/copy-button';
import { LoadedQuery } from '../../../components/loaded-query';
import { ReasonLine } from '../../../components/reason-line';
import { ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { background } from '@smarteverything/logging';
import { useBrushAct } from '../../toothbrush/data/brush-act';
import { useBrushState, useBrushView } from '../../toothbrush/data/brush-data';
import type { DiagnosticsProps } from '../../toothbrush/brand-ui';
import {
  STATUS_WORD,
  brandRows,
  confirmText,
  identityRows,
  probeRows,
  recordLines,
  testsLine,
  type OralbDiagnostics as OralbBrandView,
  type ProbeRow as ProbeModel,
} from '../model/diagnostics-model';
import { canTest, type ProbeStatus } from '../model/settings-model';
import type { BrushStateView } from '@smarteverything/domain';

const STATUS_TONE: Readonly<Record<ProbeStatus, BadgeTone>> = {
  passed: 'positive',
  failed: 'critical',
  stale: 'warning',
  none: 'neutral',
};

const LIST_MAX = 640;

function ProbeLine({
  row,
  state,
  deviceId,
  mayConfigure,
}: {
  readonly row: ProbeModel;
  readonly state: BrushStateView;
  readonly deviceId: string;
  readonly mayConfigure: boolean;
}): ReactNode {
  const { act, busy } = useBrushAct(deviceId);
  const test = canTest(row.probe, state);
  const run = (): void => {
    const text = confirmText(row.probe);
    background(
      confirm({ title: text.title, body: text.body, confirmLabel: 'Run test' }).then((accepted) => {
        if (accepted) {
          act({ action: 'probe', probe: row.probe }, 'The handle test could not run', true);
        }
      }),
      'toothbrush.probe_confirm_failed',
    );
  };
  return (
    <View className="gap-2 px-4 py-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="body">{row.text.title}</Text>
          <Text variant="callout" tone="variant">
            {row.text.writes[0]?.toUpperCase()}
            {row.text.writes.slice(1)}
          </Text>
        </View>
        <View className="shrink-0 items-end gap-2">
          <Badge label={STATUS_WORD[row.status]} tone={STATUS_TONE[row.status]} />
          {mayConfigure ? (
            <Button
              label={row.again ? 'Run again' : 'Run'}
              variant="text"
              disabled={!test.allowed || busy}
              onPress={run}
            />
          ) : null}
        </View>
      </View>
      {test.allowed || !mayConfigure ? null : <ReasonLine text={test.reason ?? ''} />}
    </View>
  );
}

function RawRecords({ brand }: { readonly brand: OralbBrandView }): ReactNode {
  const text = recordLines(brand.records);
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant" className="px-4">
        The handle’s own session records
      </Text>
      <View className="overflow-hidden rounded-md border-hairline border-outline-variant bg-surface-2">
        <View className="flex-row items-center justify-between pl-3 pr-1">
          <Text variant="caption" tone="variant">
            {brand.records.length} reads, newest last
          </Text>
          <CopyButton value={text} label="Copy the raw records" what="Raw records" />
        </View>
        <View className="px-3 pb-3">
          <NativeText selectable className="font-mono text-footnote text-on-surface">
            {text === '' ? 'No record read yet.' : text}
          </NativeText>
        </View>
      </View>
    </View>
  );
}

function Rows({ rows }: { readonly rows: readonly (readonly [string, string])[] }): ReactNode {
  return rows.map(([title, value]) => <ValueRow key={title} title={title} value={value} />);
}

function Body({
  deviceId,
  mayConfigure,
  brand,
  state,
}: DiagnosticsProps & {
  readonly brand: OralbBrandView;
  readonly state: BrushStateView;
}): ReactNode {
  const rows = probeRows(brand, brand.identity.firmware);
  return (
    <View className="gap-4" style={maxWidth(LIST_MAX)}>
      <List inset title="Handle tests" footer={testsLine(brand, brand.identity.firmware)}>
        {rows.map((row) => (
          <ProbeLine
            key={row.probe}
            row={row}
            state={state}
            deviceId={deviceId}
            mayConfigure={mayConfigure}
          />
        ))}
      </List>
      <List inset title="This brush">
        <Rows rows={identityRows(brand)} />
        <Rows rows={brandRows(brand)} />
      </List>
      <RawRecords brand={brand} />
    </View>
  );
}

function maxWidth(value: number): { readonly maxWidth: number } {
  return { maxWidth: value };
}

export function OralbDiagnostics({ deviceId, mayConfigure }: DiagnosticsProps): ReactNode {
  const diagnostics = useBrushView(deviceId, 'diagnostics');
  const state = useBrushState(deviceId);
  return (
    <LoadedQuery query={state}>
      {(loadedState) => (
        <LoadedQuery query={diagnostics}>
          {(view) =>
            view.brand.brand === 'oralb' ? (
              <Body
                deviceId={deviceId}
                mayConfigure={mayConfigure}
                brand={view.brand}
                state={loadedState}
              />
            ) : null
          }
        </LoadedQuery>
      )}
    </LoadedQuery>
  );
}
