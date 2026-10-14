import {
  EMBEDDED_BROWSER_CAPABILITY,
  AI_PREVIEW_CAPABILITY,
  AI_PREVIEW_LIFETIME_CAPABILITY,
  PREVIEW_DIAGNOSTICS_CAPABILITY,
  PREVIEW_BROWSER_DATA_CAPABILITY,
  AI_NATIVE_HTML_CAPABILITY,
  AI_NATIVE_PROJECT_CAPABILITY,
  AI_ENGINE_CAPABILITY,
  AI_ENGINE_CAPABILITY_V2,
  AI_HARNESS_CAPABILITY,
} from '@smarteverything/domain';
import { ValueStore, useValue } from '../../design/external-store';

const capabilities = new ValueStore<ReadonlyMap<string, readonly string[]>>(new Map());

export function noteServerCapabilities(url: string, advertised: string | null): void {
  const values = (advertised ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
  const current = capabilities.get().get(url);
  if (current?.join(',') === values.join(',')) return;
  capabilities.set(new Map([...capabilities.get(), [url, values]]));
}

export function clearServerCapabilities(url: string): void {
  if (!capabilities.get().has(url)) return;
  const next = new Map(capabilities.get());
  next.delete(url);
  capabilities.set(next);
}

export function serverSupportsComputerAi(url: string): boolean {
  const values = capabilities.get().get(url);
  return (
    values?.includes(AI_ENGINE_CAPABILITY) === true ||
    values?.includes(AI_ENGINE_CAPABILITY_V2) === true
  );
}

export function serverSupportsComputerAiV2(url: string): boolean {
  return capabilities.get().get(url)?.includes(AI_ENGINE_CAPABILITY_V2) === true;
}

export function serverSupportsAiHarness(url: string): boolean {
  return capabilities.get().get(url)?.includes(AI_HARNESS_CAPABILITY) === true;
}

export function useServerAiHarness(url: string | null): boolean {
  const known = useValue(capabilities);
  return url !== null && known.get(url)?.includes(AI_HARNESS_CAPABILITY) === true;
}

export function useServerComputerAi(url: string | null): boolean {
  const known = useValue(capabilities);
  return (
    url !== null &&
    (known.get(url)?.includes(AI_ENGINE_CAPABILITY) === true ||
      known.get(url)?.includes(AI_ENGINE_CAPABILITY_V2) === true)
  );
}

export function useServerComputerAiV2(url: string | null): boolean {
  const known = useValue(capabilities);
  return url !== null && known.get(url)?.includes(AI_ENGINE_CAPABILITY_V2) === true;
}

export function useServerAiPreviews(url: string | null): boolean {
  const known = useValue(capabilities);
  return url !== null && known.get(url)?.includes(AI_PREVIEW_CAPABILITY) === true;
}

export function serverSupportsNativeProject(url: string): boolean {
  return capabilities.get().get(url)?.includes(AI_NATIVE_PROJECT_CAPABILITY) === true;
}

export function serverSupportsNativeHtml(url: string): boolean {
  return capabilities.get().get(url)?.includes(AI_NATIVE_HTML_CAPABILITY) === true;
}

export function serverSupportsPreviewDiagnostics(url: string): boolean {
  return capabilities.get().get(url)?.includes(PREVIEW_DIAGNOSTICS_CAPABILITY) === true;
}
export function onPreviewDiagnosticsCapabilityChange(listener: () => void): () => void {
  return capabilities.subscribe(listener);
}

export function serverSupportsPreviewLifetime(url: string): boolean {
  return capabilities.get().get(url)?.includes(AI_PREVIEW_LIFETIME_CAPABILITY) === true;
}

export function serverSupportsEmbeddedBrowser(url: string): boolean {
  return capabilities.get().get(url)?.includes(EMBEDDED_BROWSER_CAPABILITY) === true;
}

export function useServerEmbeddedBrowser(url: string | null): boolean {
  const known = useValue(capabilities);
  return url !== null && known.get(url)?.includes(EMBEDDED_BROWSER_CAPABILITY) === true;
}

export function serverSupportsBrowserData(url: string): boolean {
  return capabilities.get().get(url)?.includes(PREVIEW_BROWSER_DATA_CAPABILITY) === true;
}
