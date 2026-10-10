import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '../../../components/button';
import { useIdiom } from '../../../design/platform';

export function FlowButton(props: Omit<ButtonProps, 'grow'>): ReactNode {
  return <Button {...props} grow={useIdiom() === 'touch'} />;
}
