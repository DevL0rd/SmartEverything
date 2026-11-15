import { use } from 'react';
import { useSizeClass } from '../../design/size-class';
import { shellRailOf, type RailForm } from './layout';
import { ShellInsetContext } from './shell-inset';

export function useShellRailShown(form: RailForm = 'sections'): boolean {
  const size = useSizeClass();
  const inset = use(ShellInsetContext);
  return size.header !== 'large' && shellRailOf(size.area - inset, form) !== null;
}
