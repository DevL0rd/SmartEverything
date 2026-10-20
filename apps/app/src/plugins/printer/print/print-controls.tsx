import type { PrinterOptions } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Checkbox } from '../../../components/checkbox';
import { NumberStepper } from '../../../components/number-stepper';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import {
  choicesOf,
  finishingWord,
  numberChoices,
  orientationOf,
  qualityOf,
  sidesOf,
  type PrintForm,
} from '../model/print-model';

export interface PrintControlsProps {
  readonly options: PrinterOptions;
  readonly form: PrintForm;
  readonly onChange: (change: Partial<PrintForm>) => void;
}

function Pick({
  label,
  values,
  value,
  onPick,
}: {
  readonly label: string;
  readonly values: readonly string[];
  readonly value: string | null;
  readonly onPick: (value: string) => void;
}): ReactNode {
  return values.length < 2 ? null : (
    <Select
      label={label}
      options={choicesOf(values)}
      value={value}
      placeholder="Printer default"
      onChange={onPick}
    />
  );
}

function Basics({ options, form, onChange }: PrintControlsProps): ReactNode {
  return (
    <View className="gap-3">
      {options.copies === null ? null : (
        <View className="gap-1">
          <Text variant="footnote" tone="variant">
            Copies
          </Text>
          <NumberStepper
            label="Copies"
            value={form.copies}
            min={options.copies.lower}
            max={Math.min(options.copies.upper, 999)}
            step={1}
            onChange={(copies) => {
              onChange({ copies });
            }}
          />
        </View>
      )}
      <Pick
        label="Sides"
        values={options.sides}
        value={form.sides}
        onPick={(value) => {
          onChange({ sides: sidesOf(value) });
        }}
      />
      <Pick
        label="Colour"
        values={options.colorModes}
        value={form.colorMode}
        onPick={(colorMode) => {
          onChange({ colorMode });
        }}
      />
      <Pick
        label="Quality"
        values={options.qualities}
        value={form.quality}
        onPick={(value) => {
          onChange({ quality: qualityOf(value) });
        }}
      />
    </View>
  );
}

function Paper({ options, form, onChange }: PrintControlsProps): ReactNode {
  return (
    <View className="gap-3">
      <Pick
        label="Paper size"
        values={options.media}
        value={form.media}
        onPick={(media) => {
          onChange({ media });
        }}
      />
      <Pick
        label="Paper tray"
        values={options.mediaSources}
        value={form.mediaSource}
        onPick={(mediaSource) => {
          onChange({ mediaSource });
        }}
      />
      <Pick
        label="Paper type"
        values={options.mediaTypes}
        value={form.mediaType}
        onPick={(mediaType) => {
          onChange({ mediaType });
        }}
      />
      <Pick
        label="Output tray"
        values={options.outputBins}
        value={form.outputBin}
        onPick={(outputBin) => {
          onChange({ outputBin });
        }}
      />
    </View>
  );
}

function Layout({ options, form, onChange }: PrintControlsProps): ReactNode {
  return (
    <View className="gap-3">
      <Pick
        label="Orientation"
        values={options.orientations}
        value={form.orientation}
        onPick={(value) => {
          onChange({ orientation: orientationOf(value) });
        }}
      />
      <Pick
        label="Scaling"
        values={options.scalings}
        value={form.scaling}
        onPick={(scaling) => {
          onChange({ scaling });
        }}
      />
      {options.numberUp.length < 2 ? null : (
        <Select
          label="Pages per sheet"
          options={numberChoices(options.numberUp)}
          value={form.numberUp === null ? null : String(form.numberUp)}
          onChange={(value) => {
            onChange({ numberUp: Number(value) });
          }}
        />
      )}
      {options.pageRanges ? (
        <TextField
          label="Pages"
          value={form.pageRanges}
          placeholder="All pages, or for example 1-3, 7"
          onChange={(pageRanges) => {
            onChange({ pageRanges });
          }}
        />
      ) : null}
    </View>
  );
}

function Finishings({ options, form, onChange }: PrintControlsProps): ReactNode {
  return options.finishings
    .filter((code) => code > 3)
    .map((code) => (
      <Checkbox
        key={code}
        label={finishingWord(code)}
        checked={form.finishings.includes(code)}
        onChange={(checked) => {
          onChange({
            finishings: checked
              ? [...form.finishings, code]
              : form.finishings.filter((entry) => entry !== code),
          });
        }}
      />
    ));
}

function Priority({ options, form, onChange }: PrintControlsProps): ReactNode {
  return options.priorities === null ? null : (
    <NumberStepper
      label="Job priority"
      value={form.priority}
      min={options.priorities.lower}
      max={options.priorities.upper}
      step={1}
      unknownValue="Printer decides"
      onChange={(priority) => {
        onChange({ priority });
      }}
    />
  );
}

function Advanced(props: PrintControlsProps): ReactNode {
  const { options, form, onChange } = props;
  return (
    <View className="gap-3">
      {options.resolutions.length < 2 ? null : (
        <Select
          label="Resolution"
          options={options.resolutions.map((value) => ({
            value: String(value),
            label: `${String(value)} dpi`,
          }))}
          value={form.resolution === null ? null : String(form.resolution)}
          onChange={(value) => {
            onChange({ resolution: Number(value) });
          }}
        />
      )}
      <Pick
        label="Optimise for"
        values={options.contentOptimize}
        value={form.contentOptimize}
        onPick={(contentOptimize) => {
          onChange({ contentOptimize });
        }}
      />
      <Pick
        label="Hold until"
        values={options.holdUntil}
        value={form.holdUntil}
        onPick={(holdUntil) => {
          onChange({ holdUntil });
        }}
      />
      <Priority {...props} />
      <Finishings {...props} />
    </View>
  );
}

export function PrintControls(props: PrintControlsProps): ReactNode {
  return (
    <View className="gap-4">
      <Basics {...props} />
      <Paper {...props} />
      <Layout {...props} />
      <Advanced {...props} />
    </View>
  );
}
