import type { ReactNode } from 'react';
import { Text } from '../../../components/text';
import { sentencesOf, spokenSentence, transcriptCopy } from './voice-pill-model';

export function VoiceTranscript({
  text,
  share,
}: {
  readonly text: string | null | undefined;
  readonly share: number;
}): ReactNode {
  const copy = transcriptCopy(text);
  if (!copy.spoken) {
    return (
      <Text
        variant="footnote"
        tone="faint"
        className="mt-1.5 px-1"
        accessibilityLiveRegion="polite"
      >
        {copy.text}
      </Text>
    );
  }
  const sentences = sentencesOf(copy.text);
  const spoken = spokenSentence(sentences, share);
  return (
    <Text selectable variant="footnote" tone="variant" className="mt-1.5 px-1">
      {sentences.map((sentence, index) =>
        index === spoken ? (
          <Text key={index} variant="footnote" className="rounded-xs bg-primary/14 text-on-surface">
            {sentence}
          </Text>
        ) : (
          sentence
        ),
      )}
    </Text>
  );
}
