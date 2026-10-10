import type { ReactNode } from 'react';
import { useState } from 'react';
import { Image, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { Provider, ProviderPrompt } from '@smarteverything/domain';
import { answerPrompt } from '../../../api/providers';
import { Button } from '../../../components/button';
import { OtpField } from '../../../components/otp-field';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { notify } from '../../../components/toast-store';
import { TuyaQr } from './tuya-qr';
import { useMutationState } from '../../../store/mutation';

export function openInBrowser(url: string): void {
  WebBrowser.openBrowserAsync(url).catch((error: unknown) => {
    notify({ message: 'The page didn’t open', error, tone: 'critical' });
  });
}

function useAnswer(provider: Provider): {
  readonly busy: boolean;
  readonly sent: boolean;
  readonly send: (answer: string) => void;
} {
  const mutation = useMutationState();
  const [sent, setSent] = useState(false);
  const send = (answer: string): void => {
    if (answer.trim() === '') {
      return;
    }
    mutation.run(() => answerPrompt(provider, answer.trim()), {
      failure: 'Your answer wasn’t sent',
      onDone: () => {
        setSent(true);
      },
    });
  };
  return { busy: mutation.busy, sent, send };
}

function SendButton({
  busy,
  sent,
  disabled,
  onPress,
}: {
  readonly busy: boolean;
  readonly sent: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Button
      label={sent ? 'Sent' : 'Continue'}
      loading={busy}
      disabled={disabled || sent}
      onPress={onPress}
    />
  );
}

function CaptchaPrompt({
  provider,
  image,
}: {
  readonly provider: Provider;
  readonly image: string;
}): ReactNode {
  const [text, setText] = useState('');
  const answer = useAnswer(provider);
  return (
    <View className="gap-4">
      <Text variant="body">Type the characters you see.</Text>
      <Image
        source={{ uri: image }}
        resizeMode="contain"
        accessibilityLabel="Captcha picture"
        className="h-24 w-full rounded-md bg-white"
      />
      <TextField
        label="Characters"
        kind="url"
        value={text}
        onChange={setText}
        onSubmit={() => {
          answer.send(text);
        }}
        focusOnMount
      />
      <SendButton
        busy={answer.busy}
        sent={answer.sent}
        disabled={text.trim() === ''}
        onPress={() => {
          answer.send(text);
        }}
      />
    </View>
  );
}

function CodePrompt({
  provider,
  destination,
}: {
  readonly provider: Provider;
  readonly destination: string;
}): ReactNode {
  const [code, setCode] = useState('');
  const answer = useAnswer(provider);
  return (
    <View className="gap-4">
      <Text variant="body">{`Enter the code sent to ${destination}.`}</Text>
      <OtpField
        label="Verification code"
        value={code}
        onChange={setCode}
        format={{ digits: 6 }}
        onSubmit={() => {
          answer.send(code);
        }}
        focusOnMount
      />
      <SendButton
        busy={answer.busy}
        sent={answer.sent}
        disabled={code.length < 4}
        onPress={() => {
          answer.send(code);
        }}
      />
    </View>
  );
}

export function PromptBody({
  provider,
  prompt,
}: {
  readonly provider: Provider;
  readonly prompt: ProviderPrompt;
}): ReactNode {
  switch (prompt.kind) {
    case 'captcha':
      return <CaptchaPrompt provider={provider} image={prompt.image} />;
    case 'verification_code':
      return <CodePrompt provider={provider} destination={prompt.destination} />;
    case 'accept_on_device':
      return <Text variant="body">{`Approve on ${prompt.device}.`}</Text>;
    case 'authorize':
      return (
        <Button
          label="Open sign-in page"
          icon="externalLink"
          onPress={() => {
            openInBrowser(prompt.url);
          }}
        />
      );
    case 'scan_qr':
      return <TuyaQr app={prompt.app} content={prompt.content} />;
  }
}
