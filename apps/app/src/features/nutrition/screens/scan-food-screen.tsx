import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BARCODE } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { CodeScanner } from '../../../components/code-scanner';

const FOOD_CODES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

export function ScanFoodScreen(): ReactNode {
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string; day?: string }>();
  return (
    <View className="flex-1 bg-black">
      <CodeScanner
        types={FOOD_CODES}
        shape="wide"
        hint="Point at the barcode on the pack"
        purpose="It is used only to read food barcodes."
        read={(data) => {
          const barcode = BARCODE.safeParse(data.trim());
          if (!barcode.success) {
            return 'That is not a food barcode';
          }
          router.dismissTo(
            href.logFood({
              barcode: barcode.data,
              ...(params.meal === undefined ? {} : { meal: params.meal }),
              ...(params.day === undefined ? {} : { day: params.day }),
            }),
          );
          return null;
        }}
        onClose={() => {
          router.back();
        }}
      />
    </View>
  );
}
