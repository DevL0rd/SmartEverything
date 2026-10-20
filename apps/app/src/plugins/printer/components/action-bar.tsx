import type { PrinterActionName } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { cn } from '../../../design/cn';
import { atLeast, useSizeClass } from '../../../design/size-class';
import type { Device } from '../../../store/state';
import type { PrinterActor } from '../data/use-printer-view';

export interface ActionBarProps {
  readonly device: Device;
  readonly actor: PrinterActor;
  readonly actions: readonly PrinterActionName[];
  readonly onPrint: () => void;
  readonly online: boolean;
}

export function ActionBar({ device, actor, actions, onPrint, online }: ActionBarProps): ReactNode {
  const wide = atLeast(useSizeClass().width, 'medium');
  const printer = device.external_id;
  const print = actions.includes('print');
  const identify = actions.includes('identify');
  const page = actions.includes('open_page');
  if (!print && !identify && !page) return null;
  return (
    <View className={cn('gap-2', wide && 'flex-row items-center')}>
      {print ? (
        <Button label="Print a file" icon="upload" disabled={!online} onPress={onPrint} />
      ) : null}
      {identify ? (
        <Button
          label="Find printer"
          icon="locate"
          variant="tonal"
          disabled={!online}
          hint="Makes the printer beep or flash"
          onPress={() => {
            actor.fire({ action: 'identify', printer }, 'Could not find the printer');
          }}
        />
      ) : null}
      {page ? (
        <View className={cn(wide && 'ml-auto')}>
          <Button
            label="Printer web page"
            icon="externalLink"
            variant="text"
            onPress={() => {
              actor.fire({ action: 'open_page', printer }, 'Could not open the printer page');
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
