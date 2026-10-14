import { gatewayBrowserAvailable } from '../../../platform/browser-surface';
import {
  nativeChatPageAvailable,
  nativeProjectPreviewAvailable,
} from '../../../platform/browser-html-projection';
import { isHtmlPublication } from './browser-selection';
import type { AiPreviewCatalogue } from '@smarteverything/domain';
import type { BrowserPublication } from './browser-selection';
export function browserPublications(
  catalogue: AiPreviewCatalogue | undefined,
): readonly BrowserPublication[] {
  return catalogue === undefined ? [] : [...catalogue.publications, ...catalogue.documents];
}
export function browserPublicationAvailability(
  catalogue: AiPreviewCatalogue | undefined,
): (publication: BrowserPublication) => boolean {
  const gateway = catalogue?.gateway.ready === true && gatewayBrowserAvailable();
  const nativeHtml = !gateway && nativeChatPageAvailable();
  return (publication): boolean =>
    gateway ||
    (nativeHtml &&
      isHtmlPublication(publication) &&
      (publication.project_source?.standalone !== false || nativeProjectPreviewAvailable()));
}
