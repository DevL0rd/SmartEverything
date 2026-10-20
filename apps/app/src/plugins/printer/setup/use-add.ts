import { useRouter } from 'expo-router';
import { useState } from 'react';
import { href } from '../../../app-shell/hrefs';
import { notify } from '../../../components/toast-store';
import { PrinterCallError } from '../data/printer-api';
import { usePrinterActor, type PrinterActor } from '../data/use-printer-view';
import {
  PressGate,
  outcomeOf,
  reasonText,
  type AddOutcome,
  type AddStep,
} from '../model/add-model';

export interface Certificate {
  readonly fingerprint: string;
  readonly subject: string;
  readonly validTo: string;
}

export interface Login {
  readonly user: string;
  readonly password: string;
}

export interface AddFlow {
  readonly step: AddStep;
  readonly uri: string;
  readonly name: string;
  readonly room: string;
  readonly problem: string | null;
  readonly certificate: Certificate | null;
  readonly busy: boolean;
  readonly setUri: (uri: string) => void;
  readonly setName: (name: string) => void;
  readonly setRoom: (room: string) => void;
  readonly goto: (step: AddStep) => void;
  readonly submit: (login?: Login) => Promise<string | null>;
}

interface Form {
  readonly uri: string;
  readonly name: string;
  readonly room: string;
  readonly fingerprint: string | null;
  readonly login: Login | null;
}

type Attempt =
  | { readonly kind: 'done'; readonly outcome: AddOutcome }
  | { readonly kind: 'failed'; readonly reason: string | null; readonly text: string };

async function attempt(actor: PrinterActor, form: Form): Promise<Attempt> {
  try {
    const reply = await actor.throwing({
      action: 'add',
      uri: form.uri.trim(),
      ...(form.name.trim() === '' ? {} : { name: form.name.trim() }),
      ...(form.room === '' ? {} : { room: form.room }),
      ...(form.fingerprint === null ? {} : { fingerprint: form.fingerprint }),
      ...form.login,
    });
    const outcome = outcomeOf(reply);
    if (outcome === null) throw new PrinterCallError('The hub gave an unexpected answer.', null);
    return { kind: 'done', outcome };
  } catch (error) {
    const reason = error instanceof PrinterCallError ? error.reason : null;
    const fallback = error instanceof Error ? error.message : 'Could not add the printer';
    return { kind: 'failed', reason, text: reasonText(reason, fallback) };
  }
}

interface Fields {
  readonly uri: string;
  readonly name: string;
  readonly room: string;
  readonly setUri: (uri: string) => void;
  readonly setName: (name: string) => void;
  readonly setRoom: (room: string) => void;
}

function useFields(): Fields {
  const [fields, setFields] = useState({ uri: '', name: '', room: '' });
  return {
    ...fields,
    setUri: (uri): void => {
      setFields((current) => ({ ...current, uri }));
    },
    setName: (name): void => {
      setFields((current) => ({ ...current, name }));
    },
    setRoom: (room): void => {
      setFields((current) => ({ ...current, room }));
    },
  };
}

export function useAddFlow(): AddFlow {
  const router = useRouter();
  const actor = usePrinterActor(null);
  const [step, goto] = useState<AddStep>('find');
  const fields = useFields();
  const [problem, setProblem] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [login, setLogin] = useState<Login | null>(null);
  const [busy, setBusy] = useState(false);
  const [gate] = useState(() => new PressGate());
  const send = async (given?: Login): Promise<string | null> => {
    setBusy(true);
    setProblem(null);
    const used = given ?? login;
    const result = await attempt(actor, {
      uri: fields.uri,
      name: fields.name,
      room: fields.room,
      fingerprint: certificate?.fingerprint ?? null,
      login: used,
    });
    setBusy(false);
    if (result.kind === 'failed') {
      if (result.reason === 'not_authenticated' || result.reason === 'not_authorized') goto('sign');
      setProblem(result.text);
      return result.text;
    }
    setLogin(used);
    const { outcome } = result;
    if (outcome.status === 'confirm_certificate') {
      setCertificate(outcome);
      goto('trust');
      return null;
    }
    notify({ message: `${outcome.printer.name} added`, tone: 'positive' });
    router.replace(href.devices());
    return null;
  };
  const submit = async (given?: Login): Promise<string | null> => gate.run(() => send(given));
  return {
    ...fields,
    step,
    problem,
    certificate,
    busy,
    goto,
    submit,
  };
}
