import type { DriveUsage } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { Card } from '../../../components/card';
import { IconButton } from '../../../components/icon-button';
import { IconWell } from '../../../components/icon-well';
import { MY_DRIVE_LABEL, SHARED_DRIVE_LABEL } from '../model/drive-access';
import { QUOTA_UNKNOWN, usageLineOf, type QuotaState } from './usage-model';
import { UsageMeter } from './usage-meter';

export interface ByDriveProps {
  readonly mine: DriveUsage | null;
  readonly quota: QuotaState;
  readonly shared: DriveUsage | null;
  readonly owner: boolean;
}

export function sharedDriveNoteOf(owner: boolean): string {
  return owner
    ? 'Everyone in the home can open and edit · counts toward no one’s quota'
    : 'Everyone in the home can open and edit';
}

function OpenDrive({
  title,
  target,
}: {
  readonly title: string;
  readonly target: AppHref;
}): ReactNode {
  return <IconButton icon="chevronRight" label={`Open ${title}`} href={target} />;
}

export function ByDrive({ mine, quota, shared, owner }: ByDriveProps): ReactNode {
  if (mine === null && shared === null) return null;
  return (
    <Card title="Your drives" icon="hardDrive">
      <View className="gap-5">
        {mine === null ? null : (
          <UsageMeter
            leading={<IconWell icon="hardDrive" colour="viz-blue" size="s" />}
            title={MY_DRIVE_LABEL}
            line={usageLineOf(mine, quota)}
            trailing={<OpenDrive title={MY_DRIVE_LABEL} target={href.drive()} />}
          />
        )}
        {shared === null ? null : (
          <UsageMeter
            leading={<IconWell icon="users" colour="viz-green" size="s" />}
            title={SHARED_DRIVE_LABEL}
            line={usageLineOf(shared, QUOTA_UNKNOWN)}
            note={sharedDriveNoteOf(owner)}
            trailing={
              <OpenDrive title={SHARED_DRIVE_LABEL} target={href.drivePage('shared-drive')} />
            }
          />
        )}
      </View>
    </Card>
  );
}
