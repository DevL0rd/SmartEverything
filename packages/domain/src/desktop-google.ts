import { z } from 'zod';

export const DESKTOP_GOOGLE_OPENED = z.strictObject({ redirectUri: z.url() });
export type DesktopGoogleOpened = z.infer<typeof DESKTOP_GOOGLE_OPENED>;

export const DESKTOP_GOOGLE_AUTHORIZE = z.strictObject({
  authUrl: z.url({ protocol: /^https$/ }),
  state: z.string().min(1),
});
export type DesktopGoogleAuthorize = z.infer<typeof DESKTOP_GOOGLE_AUTHORIZE>;

export const DESKTOP_GOOGLE_ANSWER = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('code'),
    code: z.string().min(1),
    state: z.string().min(1),
    redirectUri: z.url(),
  }),
  z.strictObject({ kind: z.literal('denied'), reason: z.string().min(1) }),
  z.strictObject({ kind: z.literal('cancelled') }),
]);
export type DesktopGoogleAnswer = z.infer<typeof DESKTOP_GOOGLE_ANSWER>;

export interface DesktopGoogleLink {
  open(): Promise<DesktopGoogleOpened>;
  authorize(input: DesktopGoogleAuthorize): Promise<DesktopGoogleAnswer>;
  cancel(): Promise<void>;
}
