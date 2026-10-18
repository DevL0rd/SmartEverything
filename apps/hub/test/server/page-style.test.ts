import { describe, expect, it } from 'vitest';
import { PAGE_STYLE, escapeHtml, htmlPage } from '../../src/server/page-style';

describe('the shared HTML page shell', () => {
  it('escapes the characters that could open a tag or an attribute', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('escapes the title but leaves the body and script as given', () => {
    const html = htmlPage({
      title: '<b>Hi</b>',
      body: '<h1>Body</h1>',
      script: '<script nonce="n">1</script>',
    });
    expect(html).toContain('<title>&lt;b&gt;Hi&lt;/b&gt;</title>');
    expect(html).toContain('<main><h1>Body</h1></main><script nonce="n">1</script>');
  });

  it('uses the standard style unless the page brings its own', () => {
    expect(htmlPage({ title: 't', body: 'b' })).toContain(`<style>${PAGE_STYLE}</style>`);
    expect(htmlPage({ title: 't', body: 'b', style: 'p{}' })).toContain('<style>p{}</style>');
  });
});
