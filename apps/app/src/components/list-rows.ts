import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';

interface RowElementProps {
  readonly children?: ReactNode;
  readonly icon?: unknown;
  readonly leading?: unknown;
  readonly setting?: unknown;
}

function settingHasIcon(setting: unknown): boolean {
  return (
    typeof setting === 'object' &&
    setting !== null &&
    'icon' in setting &&
    setting.icon !== undefined
  );
}

export function hasLeading(row: ReactNode): boolean {
  if (!isValidElement<RowElementProps>(row)) {
    return false;
  }
  const { icon, leading, setting, children } = row.props;
  if (icon !== undefined || leading !== undefined || settingHasIcon(setting)) {
    return true;
  }
  const only = Children.toArray(children);
  return only.length === 1 && hasLeading(only[0]);
}

export function rowsOf(children: ReactNode, prefix = ''): readonly ReactElement[] {
  return Children.toArray(children)
    .filter((child) => isValidElement<RowElementProps>(child))
    .flatMap((child) => {
      if (child.type === Fragment)
        return rowsOf(child.props.children, `${prefix}${String(child.key)}/`);
      return [
        prefix === '' ? child : cloneElement(child, { key: `${prefix}${String(child.key)}` }),
      ];
    });
}

export function separatorInset(row: ReactNode, inset: boolean, pointer: boolean): string {
  if (!inset || !hasLeading(row)) {
    return 'ml-4';
  }
  return pointer ? 'ml-16' : 'ml-18';
}
