import type { BottleSettingsView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { actOnBottle, readBottleView } from '../../../api/bottles';
import { BottomSheet } from '../../../components/bottom-sheet';
import { Button } from '../../../components/button';
import { notify } from '../../../components/toast-store';
import { ActionRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { shortDate } from '../../../format/time';
import { useMutationState } from '../../../store/mutation';
import { useBottleAct } from '../data/bottle-act';
import {
  canSave,
  progressLine,
  startCalibration,
  verdictOf,
  withPoint,
  withoutLastPoint,
  type CalibrationState,
} from '../model/calibration-model';
import { Anchored } from './anchored';

const INTRO =
  'Pour a known amount into the bottle, one step at a time, and let the cap measure it. The curve is then fitted to your own bottle and filter.';

function useMeasureStep(
  deviceId: string,
  onPoint: (distanceMm: number) => void,
): { readonly busy: boolean; readonly measure: () => void } {
  const { busy, run } = useMutationState();
  return {
    busy,
    measure: (): void => {
      run(
        async () => {
          const result = await actOnBottle(deviceId, { action: 'measure' });
          if (!result.ok) {
            return { kind: 'retry' as const, reason: result.detail };
          }
          const readings = await readBottleView(deviceId, 'readings', { limit: 1 });
          return verdictOf(readings.readings[0], Date.now());
        },
        {
          failure: 'The level could not be measured',
          onDone: (verdict) => {
            if (verdict.kind === 'point') {
              onPoint(verdict.distanceMm);
            } else {
              notify({ message: verdict.reason, tone: 'critical' });
            }
          },
        },
      );
    },
  };
}

function StepButtons({
  state,
  onState,
  measure,
  saving,
  onSave,
}: {
  readonly state: CalibrationState;
  readonly onState: (next: (state: CalibrationState) => CalibrationState) => void;
  readonly measure: { readonly busy: boolean; readonly run: () => void };
  readonly saving: boolean;
  readonly onSave: () => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-3">
      <Button
        label="Measure"
        icon="ruler"
        loading={measure.busy}
        disabled={state.points.length >= state.levels.length}
        onPress={measure.run}
      />
      <Button
        label="Undo last"
        variant="outlined"
        disabled={state.points.length === 0}
        onPress={() => {
          onState(withoutLastPoint);
        }}
      />
      <Button
        label="Save curve"
        variant="tonal"
        loading={saving}
        disabled={!canSave(state)}
        onPress={onSave}
      />
    </View>
  );
}

function Steps({
  view,
  onDone,
}: {
  readonly view: BottleSettingsView;
  readonly onDone: () => void;
}): ReactNode {
  const { act, busy: saving } = useBottleAct(view.deviceId);
  const [state, setState] = useState<CalibrationState>(() => startCalibration(view.body));
  const { busy, measure } = useMeasureStep(view.deviceId, (distanceMm) => {
    setState((current) => withPoint(current, distanceMm));
  });
  return (
    <View className="gap-4 pb-4">
      <Text variant="body">{progressLine(state)}</Text>
      <Text variant="footnote" tone="variant">
        {`${String(state.points.length)} measured. Keep the bottle upright and still when you tap Measure.`}
      </Text>
      <StepButtons
        state={state}
        onState={setState}
        measure={{ busy, run: measure }}
        saving={saving}
        onSave={() => {
          act(
            { action: 'set_calibration', points: [...state.points] },
            'Could not save the calibration',
            true,
          );
          onDone();
        }}
      />
    </View>
  );
}

function CalibrationRows({ view }: { readonly view: BottleSettingsView }): ReactNode {
  const { act } = useBottleAct(view.deviceId);
  if (view.calibration === null) {
    return null;
  }
  return (
    <>
      <ValueRow icon="list" title="Points measured" value={String(view.calibration.points)} />
      <ActionRow
        icon="trash"
        title="Use the standard curve"
        disabled={!view.mayEdit}
        onPress={() => {
          act({ action: 'clear_calibration' }, 'Could not remove the calibration', true);
        }}
      />
      <ActionRow
        icon="refresh"
        title="Recompute past drinks"
        subtitle="Use the new curve for drinks you have not edited"
        wrapSubtitle
        disabled={!view.mayEdit}
        onPress={() => {
          act({ action: 'rederive' }, 'Could not recompute the drinks', true);
        }}
      />
    </>
  );
}

export function CalibrationList({ view }: { readonly view: BottleSettingsView }): ReactNode {
  const [open, setOpen] = useState(false);
  const { calibration } = view;
  return (
    <List inset title="Calibration" footer={INTRO}>
      <Anchored deviceId={view.deviceId} id="calibration" label="Calibrate the level">
        <ActionRow
          icon="ruler"
          title="Calibrate the level"
          subtitle={
            calibration === null
              ? 'The standard curve is used'
              : `Fitted ${shortDate(calibration.fittedAt)}, within ${calibration.rmseMl.toFixed(1)} ml`
          }
          wrapSubtitle
          disabled={!view.mayEdit}
          onPress={() => {
            setOpen(true);
          }}
        />
      </Anchored>
      <CalibrationRows view={view} />
      <BottomSheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Calibrate the level"
        label="Calibrate the level"
        detents={['half']}
      >
        {open ? (
          <Steps
            view={view}
            onDone={() => {
              setOpen(false);
            }}
          />
        ) : null}
      </BottomSheet>
    </List>
  );
}
