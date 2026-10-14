import type { ReactNode, Ref } from 'react';
import type { BrowserTarget, BrowserStatus } from '@smarteverything/domain';
export interface BrowserHandle {
  navigate(url: string): void;
  back(): void;
  forward(): void;
  reload(): void;
  stop(): void;
}
export interface BrowserSurfaceProps {
  readonly target: BrowserTarget;
  readonly visible: boolean;
  readonly ref: Ref<BrowserHandle>;
  readonly onStatus: (status: BrowserStatus) => void;
}
export interface BrowserCapability {
  readonly available: boolean;
  readonly publicBrowsing: boolean;
  readonly limitation: string | null;
}
export type BrowserSurfaceComponent = (props: BrowserSurfaceProps) => ReactNode;
