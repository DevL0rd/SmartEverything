import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { measureAnchor, type Rect } from '../../../components/anchor';
import { Button } from '../../../components/button';
import { FilterChip } from '../../../components/filter-chip';
import { NumberStepper } from '../../../components/number-stepper';
import { SelectPicker } from '../../../components/select-picker';
import { shortDate } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import {
  dayCountOf,
  endLabelOf,
  endOfDayAfter,
  grantEndOf,
  grantEndOptionsOf,
  isPresetEnd,
  latestDayCount,
  presetEndAt,
  type GrantEnd,
} from './grant-expiry';

export interface ExpiryControlProps {
  readonly expiresAt: string | null;
  readonly who: string;
  readonly disabled: boolean;
  readonly onChange: (expiresAt: string | null) => void;
}

function DatePick({
  expiresAt,
  who,
  disabled,
  onSet,
}: {
  readonly expiresAt: string | null;
  readonly who: string;
  readonly disabled: boolean;
  readonly onSet: (expiresAt: string) => void;
}): ReactNode {
  const now = useMinute();
  const [days, setDays] = useState(() => dayCountOf(expiresAt, now));
  const end = endOfDayAfter(now, days);
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <NumberStepper
        value={days}
        min={1}
        max={latestDayCount(now)}
        step={1}
        label={`Days until ${who} loses access`}
        disabled={disabled}
        formatValue={(value) => shortDate(endOfDayAfter(now, value))}
        onChange={setDays}
      />
      <Button
        label="Set end date"
        spoken={`End access for ${who} on ${shortDate(end)}`}
        variant="tonal"
        disabled={disabled}
        onPress={() => {
          onSet(end);
        }}
      />
    </View>
  );
}

function EndPicker({
  expiresAt,
  who,
  disabled,
  onPick,
}: {
  readonly expiresAt: string | null;
  readonly who: string;
  readonly disabled: boolean;
  readonly onPick: (end: GrantEnd) => void;
}): ReactNode {
  const now = useMinute();
  const ref = useRef<View>(null);
  const opener = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  return (
    <>
      <FilterChip
        affordance="menu"
        expanded={anchor !== null}
        anchorRef={ref}
        pressRef={opener}
        label={`When access for ${who} ends`}
        value={endLabelOf(expiresAt, now)}
        icon="clock"
        active={expiresAt !== null}
        disabled={disabled}
        onPress={() => {
          measureAnchor(ref, setAnchor);
        }}
      />
      <SelectPicker
        label="Access ends"
        options={grantEndOptionsOf(expiresAt, now)}
        value={grantEndOf(expiresAt)}
        anchor={anchor}
        opener={opener}
        onClose={() => {
          setAnchor(null);
        }}
        onPick={onPick}
      />
    </>
  );
}

export interface ExpiryControl {
  readonly chip: ReactNode;
  readonly picker: ReactNode;
}

export function useExpiryControl({
  expiresAt,
  who,
  disabled,
  onChange,
}: ExpiryControlProps): ExpiryControl {
  const now = useMinute();
  const [picking, setPicking] = useState(false);
  const pick = (end: GrantEnd): void => {
    setPicking(false);
    if (end === 'never') onChange(null);
    else if (isPresetEnd(end)) onChange(presetEndAt(end, now));
    else setPicking(true);
  };
  return {
    chip: <EndPicker expiresAt={expiresAt} who={who} disabled={disabled} onPick={pick} />,
    picker: picking ? (
      <DatePick
        expiresAt={expiresAt}
        who={who}
        disabled={disabled}
        onSet={(end) => {
          setPicking(false);
          onChange(end);
        }}
      />
    ) : null,
  };
}
