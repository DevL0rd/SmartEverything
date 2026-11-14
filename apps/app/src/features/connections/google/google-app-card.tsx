import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { copyText } from '../../../components/copy-button';
import { CopyField } from '../../../components/copy-field';
import { Section } from '../../../components/section';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useSaveGoogleApp } from './google-actions';
import {
  ANDROID_PACKAGE,
  EMPTY_APP_DRAFT,
  draftReady,
  setupSteps,
  trimmedDraft,
  type GoogleAppDraft,
  type GoogleClientPlatform,
} from './google-app-setup';

const REFUSED = 'Google refused this client ID.';

function errorFor(
  refused: GoogleClientPlatform | null,
  platform: GoogleClientPlatform,
): string | null {
  return refused === platform ? REFUSED : null;
}

function Fields({
  draft,
  change,
  refused,
}: {
  readonly draft: GoogleAppDraft;
  readonly change: (patch: Partial<GoogleAppDraft>) => void;
  readonly refused: GoogleClientPlatform | null;
}): ReactNode {
  return (
    <>
      <TextField
        label="Android client ID"
        value={draft.androidClientId}
        kind="code"
        placeholder="From the Google Cloud console"
        error={errorFor(refused, 'android')}
        onChange={(androidClientId) => {
          change({ androidClientId });
        }}
      />
      <TextField
        label="Desktop client ID"
        value={draft.desktopClientId}
        kind="code"
        placeholder="From the Google Cloud console"
        error={errorFor(refused, 'desktop')}
        onChange={(desktopClientId) => {
          change({ desktopClientId });
        }}
      />
      <TextField
        label="Desktop client secret"
        kind="password"
        value={draft.desktopClientSecret}
        onChange={(desktopClientSecret) => {
          change({ desktopClientSecret });
        }}
      />
    </>
  );
}

export function GoogleAppCard({
  refused,
}: {
  readonly refused: GoogleClientPlatform | null;
}): ReactNode {
  const [draft, setDraft] = useState<GoogleAppDraft>(EMPTY_APP_DRAFT);
  const save = useSaveGoogleApp(trimmedDraft(draft), () => {
    setDraft(EMPTY_APP_DRAFT);
  });
  return (
    <Section
      title="Your Google app"
      footer="The hub keeps the client IDs and the secret in its secrets file and never shows them again. Saving replaces the stored ones."
    >
      <Card>
        <Text variant="callout" tone="variant">
          Use your own client so nothing is shared. Set its consent screen to In production, or
          Google signs you out after 7 days.
        </Text>
        <Fields
          draft={draft}
          refused={refused}
          change={(patch) => {
            setDraft((last) => ({ ...last, ...patch }));
          }}
        />
        <CopyField label="Android package" value={ANDROID_PACKAGE} />
        <View className="flex-row flex-wrap items-center gap-2">
          <Button
            label="Save Google app"
            icon="check"
            disabled={!draftReady(draft)}
            loading={save.busy}
            onPress={save.run}
          />
          <Button
            label="Copy setup steps"
            icon="copy"
            variant="text"
            onPress={() => {
              copyText(setupSteps(ANDROID_PACKAGE), 'Setup steps');
            }}
          />
        </View>
      </Card>
    </Section>
  );
}
