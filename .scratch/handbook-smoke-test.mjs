// Smoke test for the split-demo handbook right-pane reader.
// Extracts the embedded JSON + reader script from the HTML, runs them in a
// stubbed DOM, and asserts Plan A behavior. Run: node .scratch/handbook-smoke-test.mjs
import { readFileSync } from 'node:fs';

const html = readFileSync('ecommerce-software-engineering-split-demo.html', 'utf8');
const failures = [];
const ok = (name, cond) => { if (!cond) failures.push(name); console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); };

// Extract <script id="doc-embed"> JSON and the reader IIFE.
const embedMatch = html.match(/<script id="doc-embed"[^>]*>([\s\S]*?)<\/script>/);
ok('embed script tag present', !!embedMatch);
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
ok('exactly one reader script block', scripts.length === 1);
const readerJs = scripts[0][1];

// Stub DOM.
function el() {
  return {
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    textContent: '', innerHTML: '', scrollTop: 0, onclick: null,
    addEventListener() {}, href: null, getAttribute() { return null; },
  };
}
const els = { shell: el(), pane: el(), body: el(), title: el(), path: el(), status: el(), source: el(), close: el(), back: el(), embed: el() };
els.embed.textContent = embedMatch[1].replace(/^[ \t]*<!--DOC-EMBED:(START|END)-->[ \t]*$/gm, '');
global.document = { getElementById: id => ({ 'handbook-shell': els.shell, 'doc-pane': els.pane, 'doc-body': els.body, 'doc-title': els.title, 'doc-path': els.path, 'doc-status': els.status, 'doc-open-source': els.source, 'doc-close': els.close, 'doc-back': els.back, 'doc-embed': els.embed }[id] || null), addEventListener() {} };
// Fake inline <code> elements for the inline-ref conversion (like the screenshot's docs/TECH.md).
const fakeCode = [];
function fakeCodeEl(text) {
  const el = { textContent: text, _cls: new Set(), closest: () => null, parentNode: { _wrapped: null, insertBefore(a) { this._wrapped = a; } } };
  el.classList = { add: c => el._cls.add(c), contains: c => el._cls.has(c) };
  fakeCode.push(el);
  return el;
}
fakeCodeEl('docs/TECH.md');           // embedded -> should convert
fakeCodeEl('AGENTS.md');              // embedded -> should convert
fakeCodeEl('scripts/verify-quick.sh');// not a doc -> untouched
fakeCodeEl('docs/design/');           // not an embedded doc -> untouched
fakeCodeEl('docs/OKTETO.md');
{ // code inside <pre> must not be converted
  const el = fakeCodeEl('AGENTS.md');
  el.closest = () => ({});
}
global.document.querySelectorAll = sel => sel === 'main code' ? fakeCode : [];
global.document.createElement = () => ({ href: '', title: '', appendChild() {} });
global.window = { addEventListener() {}, open() {} };
global.history = { replaceState() {} };
global.location = { hash: '', href: 'file:///ecommerce-software-engineering-split-demo.html' };

new Function(readerJs)(); // eslint-disable-line no-new-func
const t = global.window.__docPaneTest;
ok('test hooks exposed', !!t);

// 1. Embedded docs: 12 keys, byte-identical to repo files.
const keys = t.embeddedKeys();
ok('12 docs embedded', keys.length === 12);
const expected = ['AGENTS.md', 'STACK.md', 'TODO.md', 'README.md', 'docs/TECH.md', 'docs/SCAFFOLD.md', 'docs/DEVOPS.md', 'docs/TESTING.md', 'docs/OKTETO.md', 'frontend/README.md', 'context/INDEX.md', 'docs/design/README.md'];
ok('embedded key set matches plan', expected.every(k => keys.includes(k)));
const fsOk = expected.every(k => html.includes(k)); // weak, byte check below via render

// Byte-identity: parse embed JSON back and compare with files.
const docs = JSON.parse(embedMatch[1].replace(/^[ \t]*<!--DOC-EMBED:(START|END)-->[ \t]*$/gm, '').replace(/<\\\//g, '</'));
let byteOk = true;
for (const k of expected) {
  const disk = readFileSync(k, 'utf8');
  if (docs[k] !== disk) { byteOk = false; console.log('  mismatch: ' + k); }
}
ok('embedded content byte-identical to repo files', byteOk);

// 2. Path resolution.
ok('doc= link resolves', t.resolveDocPath('doc=AGENTS.md') === 'AGENTS.md');
ok('github blob url resolves', t.resolveDocPath('https://github.com/lens077/ecommerce/blob/main/docs/TECH.md') === 'docs/TECH.md');
ok('github blob with qs strips query', t.resolveDocPath('https://github.com/lens077/ecommerce/blob/main/TODO.md?plain=1') === 'TODO.md');
ok('plain relative md resolves', t.resolveDocPath('docs/TECH.md') === 'docs/TECH.md');
ok('external link not intercepted', t.resolveDocPath('https://example.com/a.md') === null);
ok('anchor not intercepted', t.resolveDocPath('#overview') === null);
ok('non-md not intercepted', t.resolveDocPath('docs/DEVOPS.md#section') === null || t.resolveDocPath('x.html') === null);

// 3. Rendering: front matter, code, table, XSS.
const rm = t.renderMarkdown;
const fmOut = rm('---\ntitle: hi\n---\n# Body');
ok('front matter stripped from body', fmOut.includes('Body') && fmOut.includes('Front Matter') && !fmOut.includes('<h1>title'));
const codeOut = rm('```go\nif a < b && c > d { }\n```');
ok('code block keeps < > raw inside escaped pre', codeOut.includes('&lt;') && codeOut.includes('<pre><code>'));
const xssOut = rm('<script>alert(1)</script>');
ok('html/script escaped (XSS)', !xssOut.includes('<script>'));
const tableOut = rm('| a | b |\n| --- | --- |\n| 1 | 2 |');
ok('table rendered', tableOut.includes('<table>') && tableOut.includes('<th>a</th>') && tableOut.includes('<td>2</td>'));

// 4. Plan A openDoc: opens pane from embedded data without network.
await t.openDoc('AGENTS.md', false);
ok('pane shown after openDoc', els.shell.classList.contains('has-doc'));
ok('title set', els.title.textContent === 'AGENTS.md');
ok('status marks embedded offline', els.status.textContent.includes('内嵌原文') && els.status.textContent.includes('离线可用'));
ok('body rendered actual content', els.body.innerHTML.length > 5000);
ok('body is repo content not summary', els.body.innerHTML.includes('以真相源为准'));

// openDoc of second doc replaces content.
await t.openDoc('docs/TECH.md', true);
ok('second doc replaces content', els.body.innerHTML.includes('TECH') && els.title.textContent === 'TECH.md');

// 5. Close restores layout.
t.closeDoc();
ok('close removes has-doc', !els.shell.classList.contains('has-doc'));

// 6. Inline code references to embedded docs become clickable (screenshot request).
ok('inline refs converted at load', t.inlineRefCount() === 3); // TECH, AGENTS, OKTETO; .sh / dir / pre-nested untouched
const wrapped = fakeCode.filter(el => el._cls.has('doc-ref')).map(el => el.textContent);
ok('converted set correct', wrapped.includes('docs/TECH.md') && wrapped.includes('AGENTS.md') && wrapped.includes('docs/OKTETO.md'));
ok('pre-nested code untouched', !fakeCode[5]._cls.has('doc-ref'));
ok('wrapped into doc= anchor', fakeCode[0].parentNode._wrapped && fakeCode[0].parentNode._wrapped.href === 'doc=docs/TECH.md');
ok('converted ref resolves through click path', t.resolveDocPath('doc=docs/TECH.md') === 'docs/TECH.md');

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
