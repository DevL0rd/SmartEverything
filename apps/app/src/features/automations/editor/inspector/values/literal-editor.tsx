import type { ReactNode } from 'react';
import type { FieldControl } from '../schema-fields';
import { ColourLiteral } from './literal-colour';
import { JsonLiteral, ListLiteral, RecordLiteral } from './literal-composite';
import { isScalarControl, type ScalarControl, type StructuredControl } from './literal-model';
import { MomentLiteral } from './literal-moment';
import { ReferenceLiteral } from './literal-reference';
import type { LiteralProps } from './literal-scalar';
import {
  ChoiceLiteral,
  DurationLiteral,
  FlagLiteral,
  NumberLiteral,
  TextLiteral,
} from './literal-scalar';

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

function Structured(props: LiteralProps<StructuredControl>): ReactNode {
  const { control } = props;
  switch (control.t) {
    case 'moment':
      return <MomentLiteral {...props} control={control} />;
    case 'colour':
      return <ColourLiteral {...props} control={control} />;
    case 'reference':
      return <ReferenceLiteral {...props} control={control} />;
    case 'list':
      return <ListLiteral {...props} control={control} render={LiteralEditor} />;
    case 'record':
      return <RecordLiteral {...props} control={control} render={LiteralEditor} />;
    case 'json':
    case 'wire':
      return <JsonLiteral {...props} />;
  }
}

export function LiteralEditor(props: LiteralProps<FieldControl>): ReactNode {
  const { control } = props;
  return isScalarControl(control) ? (
    <Scalar {...props} control={control} />
  ) : (
    <Structured {...props} control={control} />
  );
}
