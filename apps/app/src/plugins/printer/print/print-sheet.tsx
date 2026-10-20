import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { LoadedQuery } from '../../../components/loaded-query';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import type { PickedFile } from '../../../platform/pick-files';
import type { Device } from '../../../store/state';
import { usePrinterView } from '../data/use-printer-view';
import { PrintControls } from './print-controls';
import { closePrintSheet, usePrintSheetOpen } from './print-store';
import { usePrintJob, type PrintPhase } from './use-print-job';
import type { PrinterOptions } from '@smarteverything/domain';

const PHASE_LABEL: Readonly<Record<PrintPhase, string>> = {
  choosing: 'Print',
  uploading: 'Uploading',
  sending: 'Sending',
};

function Document({
  file,
  progress,
  onPick,
}: {
  readonly file: PickedFile | null;
  readonly progress: number | null;
  readonly onPick: () => void;
}): ReactNode {
  return (
    <Card title="Document" icon="fileText">
      <View className="gap-2">
        <Text variant="body" numberOfLines={2}>
          {file === null ? 'Choose a PDF or an image to print' : file.name}
        </Text>
        {file === null ? null : (
          <Text variant="caption" tone="variant">
            {bytes(file.bytes)}
            {progress === null ? '' : ` · uploading ${String(Math.round(progress * 100))}%`}
          </Text>
        )}
        <View className="flex-row">
          <Button
            label={file === null ? 'Choose file' : 'Choose another'}
            variant="tonal"
            icon="upload"
            onPress={onPick}
          />
        </View>
      </View>
    </Card>
  );
}

function SheetBody({
  device,
  options,
}: {
  readonly device: Device;
  readonly options: PrinterOptions;
}): ReactNode {
  const job = usePrintJob(device, options);
  return (
    <View className="gap-4 pb-4">
      <Document file={job.file} progress={job.progress} onPick={job.choose} />
      <PrintControls options={options} form={job.form} onChange={job.change} />
      {job.problem === null ? null : (
        <Banner
          tone="critical"
          title="The printer did not accept the job"
          body={job.problem}
          wrapBody
        />
      )}
      <Button
        label={PHASE_LABEL[job.phase]}
        size="lg"
        icon="printer"
        loading={job.phase !== 'choosing'}
        disabled={job.file === null}
        onPress={job.send}
      />
    </View>
  );
}

export function PrintForm({
  device,
  enabled,
}: {
  readonly device: Device;
  readonly enabled: boolean;
}): ReactNode {
  const options = usePrinterView(device, 'options', {}, enabled);
  return (
    <LoadedQuery query={options}>
      {(loaded) => <SheetBody device={device} options={loaded} />}
    </LoadedQuery>
  );
}

export function PrintSheet({ device }: { readonly device: Device }): ReactNode {
  const open = usePrintSheetOpen();
  return (
    <Sheet open={open} onClose={closePrintSheet} title="Print" wide>
      <PrintForm device={device} enabled={open} />
    </Sheet>
  );
}
