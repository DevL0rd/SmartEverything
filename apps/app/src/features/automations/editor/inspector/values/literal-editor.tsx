import type { ReactNode } from 'react';
import { use } from 'react';
import type { FieldControl } from '../schema-fields';
import { controlScopeOf } from './control-model';
import { ControlPicker } from './control-picker';
import { ControlValue } from './control-value';
import { ColourLiteral } from './literal-colour';
import { AnyLiteral, EntriesLiteral } from './literal-any';
import { CompositeLiteral, ListLiteral, RecordLiteral } from './literal-composite';
import { isCompositeEditor } from './composite-model';
import {
  PortScopeContext,
  editorControl,
  isAnnotatedControl,
  isScalarControl,
  typedControl,
  type AnnotatedControl,
  type ScalarControl,
  type StructuredControl,
} from './literal-model';
import { DateListLiteral } from './date-list';
import { KelvinLiteral } from './kelvin-slider';
import { MomentLiteral } from './literal-moment';
import { momentEditorOf } from './moment-model';
import { WeekGridLiteral } from './week-grid';
import { EntityLiteral, ReferenceLiteral } from './literal-reference';
import { OptionSourcePicker } from './source-pickers';
import type { LiteralProps } from './literal-scalar';
import {
  ChoiceLiteral,
  DurationLiteral,
  FlagLiteral,
  NumberLiteral,
  TextLiteral,
} from './literal-scalar';

type PickControl = Extract<FieldControl, { t: 'pick' }>;

function ControlPick({
  control,
  label,
  value,
  disabled,
  onChange,
  showLabel = true,
}: LiteralProps<PickControl>): ReactNode {
  const scope = use(PortScopeContext);
  return (
    <ControlPicker
      source={control.source}
      ports={scope.ports}
      label={label}
      value={value}
      multiple={control.multiple}
      disabled={disabled}
      showLabel={showLabel}
      onChange={onChange}
    />
  );
}

function TypedLiteral(props: LiteralProps<Extract<FieldControl, { t: 'typedBy' }>>): ReactNode {
  const scope = use(PortScopeContext);
  const typed = typedControl(props.control, scope);
  if (typed.t === 'field') return <LiteralEditor {...props} control={typed.control} />;
  const { label, value, disabled, onChange, showLabel = true } = props;
  return (
    <ControlValue
      source={typed.typing.source}
      control={typed.typing.control}
      ports={scope.ports}
      label={label}
      value={value}
      disabled={disabled}
      showLabel={showLabel}
      onChange={onChange}
    />
  );
}

function Scalar(props: LiteralProps<ScalarControl>): ReactNode {
  const { control } = props;
  switch (control.t) {
    case 'switch':
      return <FlagLiteral {...props} />;
    case 'number':
      return <NumberLiteral {...props} control={control} />;
    case 'text':
      return <TextLiteral {...props} control={control} />;
    case 'choice':
      return <ChoiceLiteral {...props} control={control} />;
    case 'duration':
      return <DurationLiteral {...props} />;
  }
}

function EditorLiteral(props: LiteralProps<Extract<FieldControl, { t: 'editor' }>>): ReactNode {
  const { control } = props;
  if (isCompositeEditor(control.id))
    return <CompositeLiteral {...props} id={control.id} render={LiteralEditor} />;
  switch (momentEditorOf(control.id)) {
    case 'week-grid':
      return <WeekGridLiteral {...props} />;
    case 'date-list':
      return <DateListLiteral {...props} />;
    case 'kelvin':
      return <KelvinLiteral {...props} />;
    case null:
      return <LiteralEditor {...props} control={editorControl(control)} />;
  }
}

function Annotated(props: LiteralProps<AnnotatedControl>): ReactNode {
  const { control } = props;
  switch (control.t) {
    case 'pick':
      return controlScopeOf(control.source) === null ? (
        <OptionSourcePicker {...props} control={control} />
      ) : (
        <ControlPick {...props} control={control} />
      );
    case 'editor':
      return <EditorLiteral {...props} control={control} />;
    case 'typedBy':
      return <TypedLiteral {...props} control={control} />;
  }
}

function Structured(props: LiteralProps<StructuredControl>): ReactNode {
  const { control } = props;
  switch (control.t) {
    case 'moment':
      return <MomentLiteral {...props} control={control} />;
    case 'colour':
      return <ColourLiteral {...props} control={control} />;
    case 'reference':
      return <ReferenceLiteral {...props} control={control} />;
    case 'entity':
      return <EntityLiteral {...props} control={control} />;
    case 'list':
      return <ListLiteral {...props} control={control} render={LiteralEditor} />;
    case 'record':
      return <RecordLiteral {...props} control={control} render={LiteralEditor} />;
    case 'entries':
      return <EntriesLiteral {...props} control={control} render={LiteralEditor} />;
    case 'json':
    case 'wire':
      return <AnyLiteral {...props} render={LiteralEditor} />;
  }
}

export function LiteralEditor(props: LiteralProps<FieldControl>): ReactNode {
  const { control } = props;
  if (isAnnotatedControl(control)) return <Annotated {...props} control={control} />;
  return isScalarControl(control) ? (
    <Scalar {...props} control={control} />
  ) : (
    <Structured {...props} control={control} />
  );
}
