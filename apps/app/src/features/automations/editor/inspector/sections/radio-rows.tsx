import type { ReactNode } from 'react';
import { Icon } from '../../../../../components/icon';
import { ListRow } from '../../../../../components/list-row';
import { List } from '../../../../../components/section';

interface RadioOption {
  readonly value: string;
  readonly title: string;
  readonly subtitle?: string;
}

export interface RadioRowsProps {
  readonly title: string;
  readonly caption?: string;
  readonly options: readonly RadioOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
}

export function RadioRows({
  title,
  caption,
  options,
  value,
  onChange,
  disabled = false,
}: RadioRowsProps): ReactNode {
  return (
    <List title={title} {...(caption === undefined ? {} : { caption })}>
      {options.map((option) => (
        <ListRow
          key={option.value}
          title={option.title}
          {...(option.subtitle === undefined
            ? {}
            : { subtitle: option.subtitle, wrapSubtitle: true })}
          selected={option.value === value}
          disabled={disabled}
          trailing={option.value === value ? <Icon name="check" tone="primary" /> : null}
          onPress={() => {
            onChange(option.value);
          }}
        />
      ))}
    </List>
  );
}
