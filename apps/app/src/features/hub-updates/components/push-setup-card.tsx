import type { ReactNode } from 'react';
import type { UpdatePushSetup } from '@smarteverything/domain';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { CodeBlock } from '../../../components/code';
import { CopyField } from '../../../components/copy-field';
import { anchorKey } from '../../../components/highlight-keys';
import { Text } from '../../../components/text';
import { useHighlightAnchor } from '../../../components/use-highlight-anchor';
import { NAS_SETUP_COMMAND } from '../model/revision-view';
import { PUSH_SETUP_SETTING } from '../settings';

const GITHUB_FIELDS = [
  { label: 'Content type', value: 'application/json' },
  { label: 'Secret', value: 'The secret the NAS command printed' },
  { label: 'Events', value: 'Just the push event' },
] as const;

function SetupStep({
  number,
  title,
  children,
}: {
  readonly number: number;
  readonly title: string;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <View className="flex-row items-start gap-3">
      <View className="size-6 items-center justify-center rounded-full bg-primary-container">
        <Text variant="caption" tone="onPrimaryContainer">
          {String(number)}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-2">
        <Text variant="callout">{title}</Text>
        {children}
      </View>
    </View>
  );
}

function PayloadUrl({ url }: { readonly url: string | null }): ReactNode {
  if (url !== null) return <CopyField label="Payload URL" value={url} wrapValue />;
  return (
    <View className="items-start gap-2">
      <Text variant="footnote" tone="warning">
        The Hub has no verified public HTTPS address yet, so GitHub cannot reach it. Set one first;
        the payload URL is that address followed by /api/self-update/push.
      </Text>
      <Button
        label="Server & remote access"
        icon="globe"
        variant="outlined"
        href={href.settings.page('server')}
      />
    </View>
  );
}

function GitHubFields(): ReactNode {
  return (
    <View className="gap-1.5 rounded-md bg-surface-2 px-3 py-2">
      {GITHUB_FIELDS.map((field) => (
        <View key={field.label} className="flex-row flex-wrap gap-x-2">
          <Text variant="footnote" tone="variant" className="min-w-28">
            {field.label}
          </Text>
          <Text variant="footnote" className="min-w-0 shrink">
            {field.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SetupSteps({ push }: { readonly push: UpdatePushSetup }): ReactNode {
  return (
    <View className="gap-4">
      <SetupStep
        number={1}
        title="On the NAS, run this once. It prints the webhook secret one time; keep it for step 2."
      >
        <CodeBlock code={NAS_SETUP_COMMAND} label="NAS terminal" wrapLines />
      </SetupStep>
      <SetupStep
        number={2}
        title="In GitHub, open the repository’s Settings, then Webhooks, then Add webhook, and enter:"
      >
        <PayloadUrl url={push.webhookUrl} />
        <GitHubFields />
      </SetupStep>
      <SetupStep
        number={3}
        title="Push to the update branch. The push appears below and releases on its own."
      />
    </View>
  );
}

function ReadyBody({ push }: { readonly push: UpdatePushSetup }): ReactNode {
  return (
    <View className="gap-3">
      <Text variant="callout" tone="variant">
        The webhook secret is set. GitHub pushes to the update branch release here on their own. If
        GitHub has no webhook yet, add one with these values and the secret printed when it was set
        up.
      </Text>
      <PayloadUrl url={push.webhookUrl} />
      <GitHubFields />
      <Text variant="footnote" tone="variant">
        To replace the secret, run the setup command on the NAS again with --rotate-push-secret and
        paste the new secret into GitHub.
      </Text>
    </View>
  );
}

export function PushSetupCard({ push }: { readonly push: UpdatePushSetup }): ReactNode {
  const anchor = useHighlightAnchor(anchorKey.setting(PUSH_SETUP_SETTING), 'GitHub push webhook');
  return (
    <View {...anchor}>
      <Card
        title="GitHub push webhook"
        icon="globe"
        tone={push.secretConfigured ? 'default' : 'attention'}
        metadata={
          push.secretConfigured ? (
            <Badge label="Set up" tone="positive" icon="circleCheck" />
          ) : (
            <Badge label="Not set up" tone="warning" icon="warning" />
          )
        }
      >
        {push.secretConfigured ? <ReadyBody push={push} /> : <SetupSteps push={push} />}
      </Card>
    </View>
  );
}
