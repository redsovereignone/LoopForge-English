import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('English startup preserves user text and identifiers in diagnostics', async t => {
  const dom = new JSDOM('<p id="label">登录</p><p class="ai-user-bubble">登录</p>', {
    url: 'http://localhost/', runScripts: 'outside-only',
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.localStorage.setItem('loopforge.lang', 'zh');
  for (const file of ['boot.js', 'i18n-en.js', 'english-messages.js', 'i18n.js']) {
    window.eval(await readFile(new URL('../../web/' + file, import.meta.url), 'utf8'));
  }
  assert.equal(window.document.documentElement.lang, 'en');
  assert.equal(window.document.querySelector('#label').textContent, window.lfTranslate('登录'));
  assert.doesNotMatch(window.lfTranslate('登录'), /登录/);
  assert.equal(window.document.querySelector('.ai-user-bubble').textContent, '登录');
  assert.equal(window.lfEnglishMessage('运行失败'), 'Run failed');
  assert.equal(window.lfEnglishMessage('外部工具自定义日志'), '外部工具自定义日志');
  const message = window.lfEnglishMessage('共享分支 发布分支 在远端不存在，直推不会新建共享分支');
  assert.match(message, /发布分支/);
  assert.doesNotMatch(message, /共享分支/);
});
