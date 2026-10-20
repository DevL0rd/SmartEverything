import type { PrinterOptions } from '@smarteverything/domain';
import { useState } from 'react';
import { notify } from '../../../components/toast-store';
import { pickFiles, type PickedFile } from '../../../platform/pick-files';
import type { Device } from '../../../store/state';
import { PrinterCallError } from '../data/printer-api';
import { usePrinterActor, type PrinterActor } from '../data/use-printer-view';
import { initialForm, printOptionsOf, type PrintForm } from '../model/print-model';
import { closePrintSheet } from './print-store';
import { uploadDocument } from './upload-document';

export type PrintPhase = 'choosing' | 'uploading' | 'sending';

export interface PrintJob {
  readonly form: PrintForm;
  readonly file: PickedFile | null;
  readonly phase: PrintPhase;
  readonly progress: number | null;
  readonly problem: string | null;
  readonly change: (change: Partial<PrintForm>) => void;
  readonly choose: () => void;
  readonly send: () => void;
}

function problemText(error: unknown): string {
  if (error instanceof PrinterCallError) return error.message;
  return error instanceof Error ? error.message : 'Could not send the document';
}

interface Sending {
  readonly device: Device;
  readonly file: PickedFile;
  readonly form: PrintForm;
  readonly actor: PrinterActor;
  readonly setPhase: (phase: PrintPhase) => void;
  readonly setProgress: (progress: number | null) => void;
}

async function sendJob(sending: Sending): Promise<void> {
  const { device, file, form, actor } = sending;
  const uploadId = await uploadDocument(file, sending.setProgress);
  sending.setPhase('sending');
  await actor.throwing({
    action: 'print',
    printer: device.external_id,
    source: { kind: 'upload', uploadId },
    name: file.name.slice(0, 120),
    options: printOptionsOf(form),
  });
  closePrintSheet();
  notify({ message: 'Sent to the printer', tone: 'positive' });
}

export function usePrintJob(device: Device, options: PrinterOptions): PrintJob {
  const actor = usePrinterActor(device);
  const [form, setForm] = useState<PrintForm>(() => initialForm(options));
  const [file, setFile] = useState<PickedFile | null>(null);
  const [phase, setPhase] = useState<PrintPhase>('choosing');
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const send = (): void => {
    if (file === null) return;
    setPhase('uploading');
    setProblem(null);
    sendJob({ device, file, form, actor, setPhase, setProgress })
      .catch((error: unknown) => {
        setProblem(problemText(error));
      })
      .finally(() => {
        setPhase('choosing');
        setProgress(null);
      });
  };
  const choose = (): void => {
    pickFiles('files').then(
      (files) => {
        setFile(files[0] ?? file);
        setProblem(null);
      },
      (error: unknown) => {
        setProblem(problemText(error));
      },
    );
  };
  const change = (patch: Partial<PrintForm>): void => {
    setForm((current) => ({ ...current, ...patch }));
  };
  return {
    form,
    file,
    phase,
    progress,
    problem,
    change,
    choose,
    send,
  };
}
