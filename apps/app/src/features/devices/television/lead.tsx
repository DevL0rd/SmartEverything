import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import type { Device } from '../../../store/state';
import { AppGrid, InputPills } from './chips';
import { launchableApps } from './apps';
import { PictureSound } from './picture-sound';
import { RemoteBody } from './remote-body';
import { useTvSheets } from './sheet-state';
import { TelevisionSheets } from './sheets';
import { Stage } from './stage';
import { useTelevision } from './use-television';
import { useTelevisionActions } from './use-television-actions';

export function TelevisionLead({ device }: { readonly device: Device }): ReactNode {
  const tv = useTelevision(device);
  const actions = useTelevisionActions(tv);
  const sheets = useTvSheets();
  const apps = launchableApps(device);
  return (
    <>
      <Stage tv={tv} sheets={sheets} />
      <RemoteBody tv={tv} sheets={sheets} />
      {tv.view.inputs.length === 0 ? null : (
        <Card title="Inputs">
          <InputPills tv={tv} onChoose={actions.chooseInput} />
        </Card>
      )}
      {apps.length === 0 ? null : (
        <Card title="Apps">
          <AppGrid
            apps={apps}
            off={tv.view.mode !== 'on'}
            current={tv.view.app?.name ?? null}
            onOpen={actions.openApp}
          />
        </Card>
      )}
      <PictureSound tv={tv} />
      <TelevisionSheets tv={tv} sheets={sheets} actions={actions} apps={apps} />
    </>
  );
}
