// Chrome runs popup.html's <script> tags, and each content_scripts "js" list,
// as classic scripts that SHARE one global scope. A top-level const declared in
// two of them (e.g. destructuring a helper into a same-named const) is a
// SyntaxError that kills the whole popup or content script. The other unit
// tests import files as separate modules and can't see this, so this test
// loads every entry point exactly the way Chrome does. New scripts added to
// popup.html or manifest.json are covered automatically.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createFakeChrome } from '../support/fakeChrome.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const loadClassicScripts = (html, scripts) => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.edu/page', virtualConsole });
  dom.window.eval('this.chrome = undefined'); // make the window's context live before getInternalVMContext()
  dom.window.chrome = createFakeChrome();
  dom.window.fetch = () => new Promise(() => {});
  dom.window.addEventListener('error', (e) => errors.push(e.message));
  // vm.Script (not eval): separate Scripts in one context share the global
  // lexical scope exactly like <script> tags do; eval would isolate consts.
  const context = dom.getInternalVMContext();
  for (const rel of scripts) {
    try {
      new vm.Script(read(rel), { filename: rel }).runInContext(context);
    } catch (e) {
      errors.push(`${rel}: ${e.message}`);
    }
  }
  return { errors, window: dom.window };
};

describe('scripts load together the way Chrome loads them', () => {
  it('popup.html: all scripts run in one scope without errors', () => {
    const html = read('popup.html');
    const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
    expect(scripts).toContain('popup.js');
    const body = html.slice(html.indexOf('<body>'), html.indexOf('<script'));
    const { errors, window } = loadClassicScripts(`<!doctype html><html>${body}</html>`, scripts);
    expect(errors).toEqual([]);
    expect(window.fpConfig.API_BASE_URL).toMatch(/^https:\/\//);
  });

  it('manifest content scripts: all run in one scope without errors', () => {
    const manifest = JSON.parse(read('manifest.json'));
    for (const entry of manifest.content_scripts) {
      const { errors } = loadClassicScripts('<!doctype html><main>Some page text that is long enough</main>', entry.js);
      expect(errors).toEqual([]);
    }
  });
});
