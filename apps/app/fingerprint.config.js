const { SourceSkips } = require('@expo/fingerprint');

module.exports = {
  sourceSkips: SourceSkips.ExpoConfigVersions,
  ignorePaths: ['**/*-gradle-plugin/.kotlin/**/*'],
  extraSources: [
    {
      type: 'file',
      filePath: '../../patches/@stream-io__react-native-webrtc@145.4.1.patch',
      reasons: ['pnpm patch of native code in @stream-io/react-native-webrtc'],
    },
    {
      type: 'file',
      filePath: '../../patches/expo-updates@57.0.26.patch',
      reasons: ['pnpm patch of the Android update launch policy'],
    },
  ],
};
