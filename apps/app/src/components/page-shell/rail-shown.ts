import { use } from 'react';
import { useSizeClass } from '../../design/size-class';
import { sectionRailOf, type RailForm } from './layout';
import { ShellInsetContext } from './shell-inset';

export function useShellRailShown(form: RailForm = 'sections'): boolean {
  const size = useSizeClass();
  const inset = use(ShellInsetContext);
  return sectionRailOf(size.header === 'large', size.area - inset, form) !== null;
}
