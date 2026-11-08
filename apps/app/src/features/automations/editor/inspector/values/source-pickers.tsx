import type { ReactNode } from 'react';
import { use, useMemo } from 'react';
import {
  optionSourceOf,
  type FlowType,
  type OptionSourceId,
  type Wire,
} from '@smarteverything/domain';
import { resolveTypes } from '@smarteverything/flow/check/types';
import { typeOfWire } from '@smarteverything/flow/extract/inputs';
import { useAutomations } from '../../../data/use-automations';
import type { AutomationScope, OptionContext, OptionResult } from '../../../hosts/option-types';
import { useLintContext, useOptionSource } from '../../../hosts/use-environment';
import type { FieldControl } from '../schema-fields';
import { PortScopeContext } from './literal-model';
import { LOADING_LIST } from './literal-reference';
import type { LiteralProps } from './literal-scalar';
import { OptionPicker } from './option-picker';
import { heldOf, withHeld, type PickerOption } from './option-picker-model';
import { recordFieldsOf } from './record-fields-model';
import { kindIconOf } from './reference-picker';
import { automationScopeOf, chainValuesOf } from './source-chain-model';
import { useValueServices } from './value-services';

export type SourceControl = Extract<FieldControl, { t: 'pick' }>;

type SourceProps = LiteralProps<SourceControl>;

const ANY: FlowType = { t: 'any' };

const SCOPED_SOURCES: ReadonlySet<OptionSourceId> = new Set([
  'variables',
  'triggers.this',
  'timers.this',
  'events.emitted',
]);

function reasonOf(result: OptionResult): string | null {
  if (result.status === 'ready') return null;
  return result.status === 'loading' ? LOADING_LIST : result.reason;
}

function optionsOf(result: OptionResult, source: OptionSourceId): readonly PickerOption[] {
  if (result.status !== 'ready') return [];
  const icon = kindIconOf(optionSourceOf(source).yields);
  if (icon === undefined) return result.options;
  return result.options.map((row) => (row.icon === undefined ? { ...row, icon } : row));
}

function SourceOptions({
  result,
  control,
  label,
  value,
  disabled,
  onChange,
  showLabel = true,
}: SourceProps & { readonly result: OptionResult }): ReactNode {
  const held = heldOf(value);
  const options = withHeld(optionsOf(result, control.source), held);
  const common = { label, showLabel, options, disabled, reason: reasonOf(result) };
  if (control.multiple) {
    return (
      <OptionPicker
        {...common}
        multiple
        held={held}
        placeholder="Pick any"
        onChange={(ids) => {
          onChange([...ids]);
        }}
      />
    );
  }
  return <OptionPicker {...common} multiple={false} value={held[0] ?? null} onPick={onChange} />;
}

function useChainContext(
  fields: readonly string[] | undefined,
  automation: AutomationScope | undefined,
): OptionContext {
  const scope = use(PortScopeContext);
  return useMemo(
    (): OptionContext => ({
      values: chainValuesOf(scope.ports),
      target: scope.target,
      wholeHome: scope.wholeHome,
      search: '',
      ...(fields === undefined ? {} : { fields }),
      ...(automation === undefined ? {} : { scope: automation }),
    }),
    [scope.ports, scope.target, scope.wholeHome, fields, automation],
  );
}

function Resolved(
  props: SourceProps & { readonly fields?: readonly string[]; readonly scope?: AutomationScope },
): ReactNode {
  const { fields, scope, ...rest } = props;
  const context = useChainContext(fields, scope);
  const result = useOptionSource(props.control.source, context);
  return <SourceOptions {...rest} result={result} />;
}

function useAutomationScope(): AutomationScope | undefined {
  const { env } = useValueServices();
  const { rows } = useAutomations();
  const program = env === null ? null : env.program;
  const registry = env === null ? null : env.registry;
  return useMemo(() => {
    if (program === null || registry === null) return undefined;
    const others = rows.map((row) => row.definition);
    return automationScopeOf(program, registry, others);
  }, [program, registry, rows]);
}

function ScopedPicker(props: SourceProps): ReactNode {
  const scope = useAutomationScope();
  return scope === undefined ? <Resolved {...props} /> : <Resolved {...props} scope={scope} />;
}

function useWireTypes(): (wire: Wire) => FlowType {
  const { env } = useValueServices();
  const lint = useLintContext();
  const index = env === null ? null : env.index;
  const typed = useMemo(
    () => (index === null ? null : resolveTypes(index, lint).typed),
    [index, lint],
  );
  return (wire) => (typed === null ? ANY : typeOfWire(typed, wire));
}

function FieldPicker(props: SourceProps): ReactNode {
  const scope = use(PortScopeContext);
  const typeOf = useWireTypes();
  const { typedBy, multiple } = props.control;
  const record = typedBy === undefined ? undefined : scope.ports[typedBy];
  const found = recordFieldsOf(record, typeOf, multiple);
  if (found.t === 'none') {
    return <SourceOptions {...props} result={{ status: 'unavailable', reason: found.reason }} />;
  }
  return <Resolved {...props} fields={found.fields} />;
}

export function OptionSourcePicker(props: SourceProps): ReactNode {
  const { source } = props.control;
  if (source === 'record.fields') return <FieldPicker {...props} />;
  if (SCOPED_SOURCES.has(source)) return <ScopedPicker {...props} />;
  return <Resolved {...props} />;
}
