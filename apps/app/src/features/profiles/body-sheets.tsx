import type { ReactNode } from 'react';
import { useState } from 'react';
import { HEIGHT_LIMITS } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { ListRow } from '../../components/list-row';
import { NumberStepper } from '../../components/number-stepper';
import { List } from '../../components/section';
import { Sheet } from '../../components/sheet';
import { Text } from '../../components/text';
import { dateFormat } from '../../format/locale';
import {
  BIRTH_YEAR_MIN,
  birthIso,
  daysInMonth,
  isPast,
  withPart,
  ymdOf,
  type Ymd,
} from './birth-date';

interface SaveSheetProps {
  readonly title: string;
  readonly ready: boolean;
  readonly onSave: () => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

function SaveSheet({ title, ready, onSave, onClose, children }: SaveSheetProps): ReactNode {
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      detents={['fit']}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button label="Save" disabled={!ready} onPress={onSave} />
        </>
      }
    >
      {children}
    </Sheet>
  );
}

const MONTH_NAME = (month: number): string =>
  dateFormat({ month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month - 1, 15)));

function PartRow({
  title,
  value,
  min,
  max,
  format,
  onChange,
}: {
  readonly title: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly format?: (value: number) => string;
  readonly onChange: (value: number) => void;
}): ReactNode {
  return (
    <ListRow
      title={title}
      trailing={
        <NumberStepper
          label={title}
          min={min}
          max={max}
          step={1}
          value={value}
          {...(format === undefined ? {} : { formatValue: format })}
          onChange={onChange}
        />
      }
    />
  );
}

function BirthDateRows({
  ymd,
  maxYear,
  onChange,
}: {
  readonly ymd: Ymd;
  readonly maxYear: number;
  readonly onChange: (ymd: Ymd) => void;
}): ReactNode {
  const set =
    (part: keyof Ymd) =>
    (value: number): void => {
      onChange(withPart(ymd, part, value));
    };
  return (
    <List>
      <PartRow
        title="Year"
        value={ymd.year}
        min={BIRTH_YEAR_MIN}
        max={maxYear}
        format={String}
        onChange={set('year')}
      />
      <PartRow
        title="Month"
        value={ymd.month}
        min={1}
        max={12}
        format={MONTH_NAME}
        onChange={set('month')}
      />
      <PartRow
        title="Day"
        value={ymd.day}
        min={1}
        max={daysInMonth(ymd.year, ymd.month)}
        onChange={set('day')}
      />
    </List>
  );
}

export function BirthDateSheet({
  birthDate,
  onSave,
  onClose,
}: {
  readonly birthDate: string | null;
  readonly onSave: (birthDate: string) => void;
  readonly onClose: () => void;
}): ReactNode {
  const today = new Date();
  const [ymd, setYmd] = useState<Ymd>(() => ymdOf(birthDate, today));
  const past = isPast(ymd, today);
  const changed = birthIso(ymd) !== birthDate;
  return (
    <SaveSheet
      title="Birth date"
      ready={past ? changed : false}
      onSave={() => {
        onSave(birthIso(ymd));
      }}
      onClose={onClose}
    >
      <BirthDateRows ymd={ymd} maxYear={today.getFullYear()} onChange={setYmd} />
      {past ? null : (
        <Text variant="footnote" tone="variant">
          Pick a day that has already happened.
        </Text>
      )}
    </SaveSheet>
  );
}

const TYPICAL_HEIGHT_CM = 170;

export function AddHeightSheet({
  onSave,
  onClose,
}: {
  readonly onSave: (heightCm: number) => void;
  readonly onClose: () => void;
}): ReactNode {
  const [height, setHeight] = useState(TYPICAL_HEIGHT_CM);
  return (
    <SaveSheet
      title="Height"
      ready
      onSave={() => {
        onSave(height);
      }}
      onClose={onClose}
    >
      <NumberStepper
        label="Height"
        unit="cm"
        min={HEIGHT_LIMITS.min}
        max={HEIGHT_LIMITS.max}
        step={1}
        value={height}
        onChange={setHeight}
      />
    </SaveSheet>
  );
}
