import tseslint from 'typescript-eslint';
import { RuleTester, localRule } from './lint-rule-tester';

new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
}).run('thumbnail-size', await localRule('thumbnail-size'), {
  valid: [
    { code: 'player.generateThumbnailsAsync(0, { maxWidth: 300 });' },
    { code: 'player.generateThumbnailsAsync([0, 1], options);' },
    { code: 'generateThumbnailsAsync(0);' },
  ],
  invalid: [
    { code: 'player.generateThumbnailsAsync(0);', errors: [{ messageId: 'unsized' }] },
    {
      code: 'await video.createVideoPlayer(source).generateThumbnailsAsync([0, 2]);',
      errors: [{ messageId: 'unsized' }],
    },
  ],
});
