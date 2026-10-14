import { useId, type ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { Interactive } from './interactive';
import { Text } from './text';
import { useDecisionKeys } from './decision-keyboard';
export interface DecisionOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}
interface Props {
  readonly options: readonly DecisionOption[];
  readonly selected: readonly string[];
  readonly multi: boolean;
  readonly disabled: boolean;
  readonly choose: (id: string) => void;
}
function marker(multi: boolean, checked: boolean): string {
  if (multi) return checked ? '☑' : '☐';
  return checked ? '●' : '○';
}
function Option({
  option,
  selected,
  multi,
  disabled,
  choose,
}: Omit<Props, 'options'> & { readonly option: DecisionOption }): ReactNode {
  const checked = selected.includes(option.id);
  return (
    <Interactive
      role={multi ? 'checkbox' : 'radio'}
      label={option.label}
      hint={option.description}
      checked={checked}
      disabled={disabled || option.disabled === true}
      onPress={() => {
        choose(option.id);
      }}
      className={cn(
        'min-h-touch-min flex-row items-start gap-3 border-b border-outline-variant p-3',
        checked && 'bg-primary-container',
      )}
    >
      <Text tone={checked ? 'primary' : 'variant'}>{marker(multi, checked)}</Text>
      <View className="min-w-0 flex-1 gap-1">
        <Text>{option.label}</Text>
        {option.description === undefined ? null : (
          <Text variant="footnote" tone="variant">
            {option.description}
          </Text>
        )}
      </View>
    </Interactive>
  );
}
export function DecisionOptions(props: Props): ReactNode {
  const id = useId();
  useDecisionKeys(id, props.options, props.disabled || props.multi, props.choose);
  return (
    <View
      nativeID={id}
      accessibilityRole={props.multi ? 'none' : 'radiogroup'}
      className="overflow-hidden rounded-md border border-outline-variant"
    >
      {props.options.map((option) => (
        <Option
          key={option.id}
          option={option}
          selected={props.selected}
          multi={props.multi}
          disabled={props.disabled}
          choose={props.choose}
        />
      ))}
    </View>
  );
}
