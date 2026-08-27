import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHtml, textOf } from '../lib/sanitize.js';

/**
 * The article webhook accepts finished HTML from an external pipeline and the
 * site renders it with dangerouslySetInnerHTML. If the webhook secret ever
 * leaks, this file is the only thing between that and stored XSS on every page
 * of the site. Treat a failure here as a security regression, not a formatting
 * one.
 */

const has = (out, s) => assert.ok(out.includes(s), `expected ${s} in ${out}`);
const hasnt = (out, s) => assert.ok(!out.includes(s), `did not expect ${s} in ${out}`);

test('script and its contents are removed together', () => {
  const out = sanitizeHtml('<p>before</p><script>fetch("/steal")</script><p>after</p>');
  hasnt(out, 'script'); hasnt(out, 'steal');
  has(out, '<p>before</p>'); has(out, '<p>after</p>');
});

test('event handlers never survive, in any casing or spacing', () => {
  for (const attr of ['onclick="x()"', 'ONCLICK="x()"', 'onerror = "x()"', 'onmouseover=x']) {
    const out = sanitizeHtml(`<p ${attr}>text</p>`);
    assert.equal(out, '<p>text</p>', `survived: ${attr}`);
  }
});

test('javascript and vbscript urls are refused, including obfuscated ones', () => {
  const attacks = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    ' javascript:alert(1)',
    'vbscript:msgbox(1)',
  ];
  for (const href of attacks) {
    const out = sanitizeHtml(`<a href="${href}">click</a>`);
    hasnt(out.toLowerCase(), 'javascript:');
    hasnt(out.toLowerCase(), 'vbscript:');
    has(out, 'click');
  }
});

test('data: urls are refused unless explicitly allowed, and then only images', () => {
  const png = '<img src="data:image/png;base64,iVBORw0KGgo=" alt="a">';
  assert.equal(sanitizeHtml(png), '', 'a data image slipped through by default');
  has(sanitizeHtml(png, { allowDataImages: true }), 'data:image/png');
  assert.equal(
    sanitizeHtml('<img src="data:text/html;base64,PHNjcmlwdD4=" alt="a">', { allowDataImages: true }),
    '', 'a non-image data url was allowed');
});

test('ordinary links and images come through intact', () => {
  const out = sanitizeHtml('<a href="https://data.gov.sg" title="source">HDB</a>');
  has(out, 'href="https://data.gov.sg"'); has(out, 'title="source"');
  has(sanitizeHtml('<a href="/hdb/bishan">block</a>'), 'href="/hdb/bishan"');
});

test('a new-tab link always gets noopener, and cannot decline it', () => {
  const out = sanitizeHtml('<a href="https://x.com" target="_blank" rel="opener">x</a>');
  has(out, 'rel="noopener noreferrer"');
  hasnt(out, 'rel="opener"');
});

test('style, iframe, object, form and base are all removed', () => {
  for (const tag of ['style', 'iframe', 'object', 'embed', 'form', 'base', 'meta', 'link']) {
    const out = sanitizeHtml(`<${tag} src="x" href="x">payload</${tag}><p>kept</p>`);
    hasnt(out.toLowerCase(), `<${tag}`);
    has(out, '<p>kept</p>');
  }
});

test('a second h1 cannot be injected into the document outline', () => {
  const out = sanitizeHtml('<h1>rival heading</h1><h2>fine</h2>');
  hasnt(out, '<h1'); has(out, '<h2>fine</h2>');
  has(out, 'rival heading');   // the text stays; only the tag goes
});

test('unbalanced and unterminated markup fails closed rather than open', () => {
  assert.equal(sanitizeHtml('<p>unclosed'), '<p>unclosed</p>');
  assert.equal(sanitizeHtml('</p>stray'), 'stray');
  const bad = sanitizeHtml('<p>text<img src="https://x/a.png" alt="x"');
  hasnt(bad, '<img');          // the tag never terminated, so it is not emitted
  has(bad, 'text');
});

test('tables and formatting used by real articles survive', () => {
  const article = '<h2>Bishan</h2><p>The <strong>median</strong> was <em>$1,099</em>.</p>' +
    '<table><thead><tr><th scope="col">Town</th></tr></thead><tbody><tr><td>Bishan</td></tr></tbody></table>' +
    '<ul><li>one</li><li>two</li></ul><blockquote>quoted</blockquote>';
  const out = sanitizeHtml(article);
  for (const s of ['<h2>', '<strong>', '<em>', '<table>', '<th scope="col">', '<li>', '<blockquote>']) has(out, s);
});

test('text is escaped, so markup in prose cannot become markup', () => {
  const out = sanitizeHtml('<p>5 < 10 and 10 > 5 &amp; that is that</p>');
  has(out, '&lt;'); has(out, '&gt;');
  hasnt(out, '<script');
});

/*
 * The case above passed all the way through the prose-eating bug, twice.
 *
 * A stray '<' followed by a DIGIT cannot begin a tag name, so the parser
 * rejected it and escaped it back into the text — correctly. Put a LETTER
 * after the bracket and it reads a plausible tag name instead, finds it is not
 * on the allowlist, and drops everything up to the next '>' — which is the
 * closing tag of the paragraph, several sentences later.
 *
 * "price < expected" and "a < b" are ordinary things to write about property.
 * The first article posted through the Make.com webhook lost half a paragraph
 * to this, and every existing test stayed green while it happened.
 */
test('a stray < followed by a letter does not eat the rest of the paragraph', () => {
  const out = sanitizeHtml('<p>a stray < angle bracket in prose</p>');
  has(out, '&lt;');
  has(out, 'angle bracket in prose');   // the words after the bracket survive
  has(out, '</p>');                     // and so does the tag that closed them
});

test('a stray < does not swallow the markup that follows it', () => {
  const out = sanitizeHtml('<p>under < budget, a <b>bold</b> run</p><p>tail</p>');
  has(out, '&lt;');
  has(out, 'budget');
  has(out, '<b>bold</b>');   // a real element after the stray bracket still parses
  has(out, 'tail');
});

test('a non-string input returns an empty string rather than throwing', () => {
  for (const v of [null, undefined, 42, {}, []]) assert.equal(sanitizeHtml(v), '');
});

test('textOf strips markup and decodes entities for excerpts', () => {
  assert.equal(textOf('<p>Hello <b>there</b> &amp; welcome</p>'), 'Hello there & welcome');
  assert.equal(textOf(null), '');
});
