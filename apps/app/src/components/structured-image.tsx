import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import { z } from 'zod';
import type { JsonValue } from '@smarteverything/domain';
import { Text } from './text';
const MEDIA = z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const CONTENT = z.union([
  z.looseObject({ type: z.literal('image'), data: z.string().min(1), media_type: MEDIA }),
  z
    .looseObject({ type: z.literal('image'), data: z.string().min(1), mimeType: MEDIA })
    .transform((value) => ({ data: value.data, media_type: value.mimeType })),
  z
    .looseObject({
      type: z.literal('image'),
      source: z.looseObject({
        type: z.literal('base64'),
        data: z.string().min(1),
        media_type: MEDIA,
      }),
    })
    .transform((value) => value.source),
]);
export function structuredImage(value: JsonValue, title: string): ReactNode {
  const result = CONTENT.safeParse(value);
  if (!result.success) return null;
  return (
    <View className="gap-2">
      <Text variant="label">{title}</Text>
      <Image
        source={{ uri: `data:${result.data.media_type};base64,${result.data.data}` }}
        resizeMode="contain"
        accessibilityLabel={title}
        accessibilityIgnoresInvertColors
        className="h-64 w-full rounded-md bg-surface-2"
      />
    </View>
  );
}
