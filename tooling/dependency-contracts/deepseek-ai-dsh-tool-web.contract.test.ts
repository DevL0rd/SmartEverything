import { describe, expect, it } from 'vitest';
import { fetchMetaFromValue, formatFetchOutput } from '@deepseek-ai/dsh-tool-web';
import { HUB_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

describe('@deepseek-ai/dsh-tool-web', () => {
  it('matches the hub pin and formats HTML as bounded untrusted Markdown', () => {
    expect(installedVersion('@deepseek-ai/dsh-tool-web')).toBe(
      declaredVersion(HUB_MANIFEST, '@deepseek-ai/dsh-tool-web'),
    );
    const result = {
      url: 'https://example.com/',
      statusCode: 200,
      body: { kind: 'html', content: '<h1>Document</h1><script>secret</script>' },
      truncated: false,
    } as const;
    const text = formatFetchOutput(result, 1000);
    expect(text).toContain('# Document');
    expect(text).toContain('untrusted');
    expect(text).not.toContain('secret');
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(fetchMetaFromValue(result, 1000)).toStrictEqual({
      url: result.url,
      statusCode: 200,
      truncated: false,
    });
  });
});
