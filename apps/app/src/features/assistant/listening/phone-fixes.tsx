import type { ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { allowMicrophone, keepRunning, useIsThisPhone, usePhoneNode } from '../../phone';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { FixCard } from './fix-card';

function Battery(): ReactNode {
  const node = usePhoneNode();
  if (node.kind !== 'ready') return null;
  if (node.status.permissions.batteryUnrestricted) {
    return (
      <FixCard
        icon="battery"
        done
        title="Battery: Unrestricted"
        body="Android will not pause listening."
      />
    );
  }
  return (
    <FixCard
      icon="battery"
      title="Battery saver may stop listening"
      body="Set the app to Unrestricted so Android keeps the microphone service running."
      action={{
        label: 'Open battery settings',
        onPress: () => {
          background(keepRunning(), 'listening.battery_failed');
        },
      }}
    />
  );
}

function ThisPhone({ allowed }: { readonly allowed: boolean }): ReactNode {
  return (
    <>
      {allowed ? (
        <FixCard
          icon="mic"
          done
          title="Microphone allowed"
          body="Listens in the background with a notification."
        />
      ) : (
        <FixCard
          icon="micOff"
          title="Microphone is not allowed"
          body="Android needs the microphone permission to listen for the wake word."
          action={{
            label: 'Allow microphone',
            onPress: () => {
              background(allowMicrophone(), 'listening.microphone_failed');
            },
          }}
        />
      )}
      <Battery />
    </>
  );
}

function PhoneFixesOf({
  device,
  allowed,
}: {
  readonly device: Device;
  readonly allowed: boolean;
}): ReactNode {
  if (useIsThisPhone(device)) return <ThisPhone allowed={allowed} />;
  return allowed ? null : (
    <FixCard
      icon="micOff"
      title="Microphone is not allowed"
      body="Open SmartEverything on that phone and allow the microphone."
    />
  );
}

export function PhoneFixes({
  deviceId,
  allowed,
}: {
  readonly deviceId: string;
  readonly allowed: boolean;
}): ReactNode {
  const device = useDevice(deviceId);
  return device === null ? null : <PhoneFixesOf device={device} allowed={allowed} />;
}
