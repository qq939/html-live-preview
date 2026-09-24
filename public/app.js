/* app.js — HTML live preview app
 *
 * Features:
 *  - Left: textarea editor + snippet buttons + collapsible file manager (localStorage-backed)
 *  - Right top: iframe preview (auto-rendered every X seconds; manual render-now button)
 *  - Right bottom (~1/3): console output (re-rendered every X seconds)
 *  - Top-right: scroll-wheel control for interval X (1-1000, default 10)
 *  - Abbreviation + Enter expansion (Emmet-like mini set) in editor
 */

(function () {
  'use strict';

  // ===== Snippets (inserted at cursor) ==================================
  const SNIPPETS = [
    { label: '<!DOCTYPE html>', code:
`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>Document</title>
</head>
<body>
  $0
</body>
</html>` },
    { label: '<div>', code: `<div>$0</div>` },
    { label: '<p>', code: `<p>$0</p>` },
    { label: '<span>', code: `<span>$0</span>` },
    { label: '<a>', code: `<a href="#">$0</a>` },
    { label: '<img>', code: `<img src="" alt="" />` },
    { label: '<ul><li>', code: `<ul>\n  <li>$0</li>\n</ul>` },
    { label: '<table>', code:
`<table border="1" cellspacing="0" cellpadding="6">
  <thead>
    <tr><th>$0</th></tr>
  </thead>
  <tbody>
    <tr><td></td></tr>
  </tbody>
</table>` },
    { label: '<form>', code:
`<form action="#" method="get">
  <label>姓名 <input type="text" name="name" /></label>
  <button type="submit">提交</button>
</form>` },
    { label: '<button>', code: `<button type="button">$0</button>` },
    { label: '<script>', code: `<script>\n  $0\n</script>` },
    { label: '<style>', code: `<style>\n  $0\n</style>` },
    { label: 'lorem', code: `Lorem ipsum dolor sit amet, consectetur adipisicing elit. $0` },
    { label: 'console.log', code: `console.log($0);` },
  ];

  // ===== Abbreviation expansions (Emmet-lite) ==========================
  function expandAbbrev(raw) {
    const t = raw.trim();
    if (!t) return null;

    if (t === 'html' || t === 'html5') {
      return `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8" />\n  <title>Document</title>\n</head>\n<body>\n  $0\n</body>\n</html>`;
    }

    const partTexts = t.split(/([>+])/).reduce((acc, cur, i, arr) => {
      if (i % 2 === 0) acc.push({ op: i === 0 ? null : arr[i - 1], text: cur });
      return acc;
    }, []);

    const parts = partTexts.map((p) => {
      const txt = p.text;
      const m2 = txt.match(/\*(\d+)$/);
      const n = m2 ? parseInt(m2[1], 10) : 1;
      return { op: p.op, text: txt.replace(/\*\d+$/, ''), mul: n };
    });

    function fullTag(partText) {
      const mm = partText.match(/^([a-zA-Z][a-zA-Z0-9-]*)((?:[.#][\w-]+)*)(\[[^\]]+\])?$/);
      if (!mm) return null;
      const tg = mm[1];
      const clsIds = mm[2] || '';
      const at = mm[3] || '';
      let cls = '', id = '';
      clsIds.replace(/([.#])([\w-]+)/g, (_, s, v) => {
        if (s === '.') cls += (cls ? ' ' : '') + v;
        else id = v;
      });
      let a = '';
      if (at) a = ' ' + at.slice(1, -1).trim();
      let s = '<' + tg;
      if (id) s += ` id="${id}"`;
      if (cls) s += ` class="${cls}"`;
      if (a) s += a;
      s = s.replace(/\s+\/>$/, ' />').replace(/\s+>$/, '>');
      const voids = new Set(['img','br','hr','input','meta','link','source','area','base','col','embed','param','track','wbr']);
      if (voids.has(tg.toLowerCase())) s += ' />';
      else s += '>$0</' + tg + '>';
      return s;
    }

    function render(partIndex, level, indentStr) {
      if (partIndex >= parts.length) return '$0';
      const part = parts[partIndex];
      const tagStr = fullTag(part.text);
      if (!tagStr) return indentStr + part.text + '\n';
      const isVoid = /^<[a-zA-Z][a-zA-Z0-9-]*[^>]*\/>$/.test(tagStr);
      const inner = render(partIndex + 1, level + 1, indentStr + '  ');
      const n = part.mul || 1;
      let out = '';
      for (let i = 0; i < n; i++) {
        if (isVoid) out += indentStr + tagStr + '\n';
        else out += indentStr + tagStr.replace('$0', inner) + '\n';
      }
      return out;
    }

    let out = render(0, 0, '');
    if (!out.includes('$0')) {
      out = out.replace(/^( {0,})(<[a-zA-Z][^>]*>)([^\n]*)/m, (m, sp, opn, rest) => sp + opn + '$0' + rest);
    }
    return out.replace(/^\n+|\n+$/g, '') + '\n';
  }

  // ===== DOM refs =======================================================
  const editor      = document.getElementById('editor');
  const iframe      = document.getElementById('preview');
  const consoleEl   = document.getElementById('console');
  const clearBtn    = document.getElementById('clearConsole');
  const intervalEl  = document.getElementById('intervalValue');
  const intervalCtl = document.getElementById('intervalControl');
  const snippetsEl  = document.getElementById('snippets');
  const renderNowBtn = document.getElementById('renderNow');
  const fmCell      = document.getElementById('fileManager');
  const fmToggle    = document.getElementById('fmToggle');
  const fmArrow     = document.getElementById('fmArrow');
  const fmBody      = document.getElementById('fmBody');
  const fmList      = document.getElementById('fmList');
  const fmEmpty     = document.getElementById('fmEmpty');
  const saveBtn     = document.getElementById('saveBtn');
  const previewCell = document.getElementById('previewCell');
  const previewToggle = document.getElementById('previewToggle');
  const previewArrow  = document.getElementById('previewArrow');
  const previewBody   = document.getElementById('previewBody');

  // ===== Splitters (draggable layout dividers) =========================
  const layoutEl    = document.getElementById('layout');
  const leftCol     = document.getElementById('leftCol');
  const rightCol    = document.getElementById('rightCol');
  const splitterV   = document.getElementById('splitterV');
  const splitterHL  = document.getElementById('splitterHLeft');
  const splitterHR  = document.getElementById('splitterHRight');
  const resetBtn    = document.getElementById('resetLayout');

  // Layout state — persisted to localStorage.
  // ratio = primary / (primary + secondary); stored as 0..1
  const LAYOUT_KEY = 'layout.ratios.v1';
  const DEFAULT_LAYOUT = { vSplit: 0.5, hSplitLeft: 0.62, hSplitRight: 0.5 };
  let layoutState = Object.assign({}, DEFAULT_LAYOUT, readLayout());

  function readLayout() {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (!raw) return {};
      const o = JSON.parse(raw);
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }
  function writeLayout() {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutState)); } catch (e) {}
  }

  function applyLayout() {
    // vertical (left vs right column width)
    const v = clamp(layoutState.vSplit, 0.15, 0.85);
    leftCol.style.flex  = `${v} 1 0`;
    rightCol.style.flex = `${1 - v} 1 0`;

    // horizontal splits inside each column
    const hL = clamp(layoutState.hSplitLeft, 0.15, 0.85);
    const hR = clamp(layoutState.hSplitRight, 0.15, 0.85);
    applyColSplit(leftCol,  hL, splitterHL);
    applyColSplit(rightCol, hR, splitterHR);
  }
  function applyColSplit(col, ratio, splitterEl) {
    // The col contains: [topCell, splitterEl, bottomCell, ...]
    // We set the first two flex children (topCell + bottomCell).
    // Splitter itself is flex:0 0 6px (from CSS).
    const cells = col.querySelectorAll(':scope > .cell');
    if (cells.length < 2) return;
    const top = cells[0], bot = cells[1];
    const topIsCollapsed = top.classList.contains('collapsed');
    const botIsCollapsed = bot.classList.contains('collapsed');
    if (topIsCollapsed) { top.style.flex = '0 0 auto'; }
    else { top.style.flex = `${ratio} 1 0`; }
    if (botIsCollapsed) { bot.style.flex = '0 0 auto'; }
    else { bot.style.flex = `${1 - ratio} 1 0`; }
    // hide splitter if either side collapsed
    if (splitterEl) splitterEl.style.display = (topIsCollapsed || botIsCollapsed) ? 'none' : '';
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Generic splitter handler
  function makeDraggable(splitter, opts) {
    let dragging = false;
    let startCoord = 0;
    let startRatio = 0;
    const onMove = (ev) => {
      if (!dragging) return;
      const coord = opts.axis === 'x' ? ev.clientX : ev.clientY;
      const delta = coord - startCoord;
      const total = opts.totalSize();
      if (total <= 0) return;
      const newRatio = clamp(startRatio + delta / total, opts.min, opts.max);
      opts.onChange(newRatio);
      applyLayout();
      ev.preventDefault();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      splitter.classList.remove('dragging');
      document.body.classList.remove('dragging', 'no-select');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      writeLayout();
    };
    splitter.addEventListener('mousedown', (ev) => {
      // ignore clicks on inner elements (header buttons etc.)
      if (ev.target !== splitter && ev.target.parentElement !== splitter) {
        // allow ::before pseudo (transparent hit area) — accept any descendant
      }
      dragging = true;
      startCoord = opts.axis === 'x' ? ev.clientX : ev.clientY;
      startRatio = opts.getRatio();
      splitter.classList.add('dragging');
      document.body.classList.add('dragging', 'no-select');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      ev.preventDefault();
    });
  }

  makeDraggable(splitterV, {
    axis: 'x',
    getRatio: () => layoutState.vSplit,
    onChange: (r) => { layoutState.vSplit = r; },
    totalSize: () => layoutEl.getBoundingClientRect().width,
    min: 0.15, max: 0.85,
  });
  makeDraggable(splitterHL, {
    axis: 'y',
    getRatio: () => layoutState.hSplitLeft,
    onChange: (r) => { layoutState.hSplitLeft = r; },
    totalSize: () => leftCol.getBoundingClientRect().height,
    min: 0.15, max: 0.85,
  });
  makeDraggable(splitterHR, {
    axis: 'y',
    getRatio: () => layoutState.hSplitRight,
    onChange: (r) => { layoutState.hSplitRight = r; },
    totalSize: () => rightCol.getBoundingClientRect().height,
    min: 0.15, max: 0.85,
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      layoutState = Object.assign({}, DEFAULT_LAYOUT);
      writeLayout();
      applyLayout();
    });
  }

  // ===== Default content ===============================================
  const DEFAULT = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>预览</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 20px; }
    .btn { padding: 8px 14px; border-radius: 6px; border: 1px solid #4f9dff; background: #4f9dff; color: #fff; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Hello, HTML!</h1>
  <p>左边编辑，右边实时预览。试试在编辑器里输入 <code>html</code> 然后回车。</p>
  <button class="btn" onclick="console.log('按钮被点击了！', 1+1)">点我看 console</button>

  <script>
    console.info('脚本已加载');
    setTimeout(() => console.warn('这是一条 warning'), 800);
    try { undefinedFn(); } catch (e) { console.error('捕获到错误:', e.message); }
  </script>
</body>
</html>`;

  // Load last file if any, else default
  function loadInitialContent() {
    const lastId = localStorage.getItem('currentFileId');
    if (lastId) {
      const files = readFiles();
      const f = files.find((x) => x.id === lastId);
      if (f) return f.content;
    }
    return localStorage.getItem('editorContent') || DEFAULT;
  }
  editor.value = loadInitialContent();

  // ===== Snippets bar ==================================================
  for (const s of SNIPPETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'snippet-btn';
    btn.textContent = s.label;
    btn.title = '点击插入到光标位置';
    btn.addEventListener('click', () => insertAtCursor(s.code));
    snippetsEl.appendChild(btn);
  }

  // ===== Editor helpers ================================================
  function getCursor() {
    return { start: editor.selectionStart, end: editor.selectionEnd };
  }
  function setCursor(pos) {
    editor.focus();
    editor.setSelectionRange(pos, pos);
  }
  function insertAtCursor(text) {
    const { start, end } = getCursor();
    const before = editor.value.slice(0, start);
    const after  = editor.value.slice(end);
    const raw = before + text + after;
    const idx = text.indexOf('$0');
    editor.value = raw.replace('$0', '');
    const caret = idx < 0 ? before.length + text.length : before.length + idx;
    setCursor(caret);
    persist();
    scheduleImmediateRender();
  }
  function persist() {
    try { localStorage.setItem('editorContent', editor.value); } catch (e) {}
  }
  editor.addEventListener('input', () => { persist(); });

  // ===== Abbreviation + Enter ==========================================
  editor.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    const { start } = getCursor();
    const lineStart = editor.value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = editor.value.indexOf('\n', start);
    const le = lineEnd === -1 ? editor.value.length : lineEnd;
    const line = editor.value.slice(lineStart, le);
    const expanded = expandAbbrev(line);
    if (!expanded) return;
    const before = editor.value.slice(0, lineStart);
    const after  = editor.value.slice(le);
    const caretTarget = before.length + expanded.indexOf('$0');
    const final = before + expanded.replace('$0', '') + after;
    editor.value = final;
    setCursor(caretTarget < 0 ? before.length + expanded.length - 2 : caretTarget);
    ev.preventDefault();
    persist();
    scheduleImmediateRender();
  });

  // ===== Tab inserts two spaces ========================================
  editor.addEventListener('keydown', (ev) => {
    if (ev.key === 'Tab') {
      ev.preventDefault();
      const { start, end } = getCursor();
      editor.value = editor.value.slice(0, start) + '  ' + editor.value.slice(end);
      setCursor(start + 2);
      persist();
    }
  });

  // ===== Interval control (scroll wheel) ===============================
  let intervalSec = clampInterval(parseInt(localStorage.getItem('intervalSec'), 10) || 10);
  function clampInterval(v) {
    v = Math.round(Number(v) || 10);
    if (v < 1) v = 1;
    if (v > 1000) v = 1000;
    return v;
  }
  function setInterval(v, persistIt) {
    intervalSec = clampInterval(v);
    intervalEl.textContent = String(intervalSec);
    if (persistIt) localStorage.setItem('intervalSec', String(intervalSec));
    restartTimer();
  }
  setInterval(intervalSec, false);

  intervalCtl.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const dir = ev.deltaY < 0 ? 1 : -1;
    const step = Math.max(1, Math.min(50, Math.abs(ev.deltaY) | 0));
    setInterval(intervalSec + dir * step, true);
  }, { passive: false });

  intervalCtl.addEventListener('click', () => {
    const v = prompt('设置渲染间隔 (1-1000 秒)：', String(intervalSec));
    if (v !== null) setInterval(parseInt(v, 10), true);
  });

  // ===== Render Now button =============================================
  renderNowBtn.addEventListener('click', () => {
    render();
    // brief feedback
    renderNowBtn.classList.add('flash');
    setTimeout(() => renderNowBtn.classList.remove('flash'), 400);
  });

  // ===== Console messaging (from iframe via postMessage) ================
  const pendingLogs = [];
  window.addEventListener('message', (ev) => {
    const data = ev.data;
    if (!data || data.__lp !== true) return;
    pendingLogs.push({
      level: data.level || 'log',
      args:  data.args  || [],
      ts:    data.ts || Date.now(),
    });
  });

  function fmtArgs(args) {
    return args.map((a) => {
      if (a == null) return String(a);
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a, null, 2); } catch { return String(a); }
    }).join(' ');
  }

  function flushConsole() {
    if (pendingLogs.length === 0) return;
    const frag = document.createDocumentFragment();
    for (const m of pendingLogs.splice(0)) {
      const line = document.createElement('div');
      line.className = 'log-line ' + m.level;
      const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = m.level;
      const ts  = document.createElement('span'); ts.className = 'ts';
      ts.textContent = new Date(m.ts).toLocaleTimeString();
      const body = document.createElement('span'); body.textContent = fmtArgs(m.args);
      line.appendChild(tag); line.appendChild(ts); line.appendChild(body);
      frag.appendChild(line);
    }
    consoleEl.appendChild(frag);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  clearBtn.addEventListener('click', () => { consoleEl.innerHTML = ''; });

  // ===== Render (iframe via blob URL) ==================================
  // We use blob: URL with sandbox="allow-scripts allow-modals allow-forms".
  // This is reliable across browsers and avoids the srcdoc/same-origin quirks.
  let currentBlobUrl = null;
  function buildHtml(html) {
    const bridge = `
<script>
(function(){
  function send(level, args){
    try {
      parent.postMessage({ __lp: true, level: level, args: args.map(function(a){
        if (a instanceof Error) return { name: a.name, message: a.message, stack: a.stack };
        if (typeof a === 'object') { try { return JSON.parse(JSON.stringify(a)); } catch(e){ return String(a); } }
        return a;
      }), ts: Date.now() }, '*');
    } catch(e){}
  }
  ['log','info','warn','error','debug'].forEach(function(l){
    var orig = console[l];
    console[l] = function(){ send(l, [].slice.call(arguments)); try { orig.apply(console, arguments); } catch(e){} };
  });
  window.addEventListener('error', function(ev){
    send('error', [ev.message + ' @ ' + ev.filename + ':' + (ev.lineno||0) + ':' + (ev.colno||0)]);
  });
  window.addEventListener('unhandledrejection', function(ev){
    send('error', ['Unhandled promise rejection: ' + ((ev.reason && ev.reason.message) || ev.reason)]);
  });
})();
</script>`;
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head[^>]*>/i, (m) => m + bridge);
    }
    if (/<html[^>]*>/i.test(html)) {
      return html.replace(/<html[^>]*>/i, (m) => m + '<head>' + bridge + '</head>');
    }
    // bare fragment → wrap
    return '<!DOCTYPE html><html><head>' + bridge + '</head><body>' + html + '</body></html>';
  }

  function render() {
    const raw = editor.value || '<!DOCTYPE html><html><body></body></html>';
    const html = buildHtml(raw);
    // Use srcdoc — most reliable cross-browser approach for HTML preview.
    // We also keep blob URL as a fallback for browsers that mishandle srcdoc.
    let rendered = false;
    try {
      iframe.srcdoc = html;
      rendered = true;
    } catch (e) {
      rendered = false;
    }
    if (!rendered) {
      try {
        if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        iframe.src = currentBlobUrl;
      } catch (e) {
        consoleEl.innerHTML += `<div class="log-line error"><span class="tag">error</span><span class="ts">${new Date().toLocaleTimeString()}</span><span>渲染失败: ${(e && e.message) || e}</span></div>`;
      }
    }
    // visual flash on the preview wrapper
    const wrap = iframe.parentElement;
    wrap.classList.remove('flash');
    void wrap.offsetWidth;
    wrap.classList.add('flash');
    flushConsole();
  }

  let timerId = null;
  let immediateHandle = null;
  function restartTimer() {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(render, intervalSec * 1000);
  }
  function scheduleImmediateRender() {
    if (immediateHandle) clearTimeout(immediateHandle);
    immediateHandle = setTimeout(render, 250);
  }

  // Periodic console flush
  setInterval(flushConsole, 500);

  // ===== File Manager ==================================================
  const FM_KEY = 'fileManager.files.v1';
  let currentFileId = localStorage.getItem('currentFileId') || null;

  function readFiles() {
    try {
      const raw = localStorage.getItem(FM_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeFiles(files) {
    try { localStorage.setItem(FM_KEY, JSON.stringify(files)); } catch (e) {}
  }
  function fmtTime(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function renderFileList() {
    const files = readFiles().sort((a, b) => b.updated - a.updated);
    fmList.innerHTML = '';
    if (files.length === 0) {
      fmEmpty.style.display = 'block';
      return;
    }
    fmEmpty.style.display = 'none';
    for (const f of files) {
      const item = document.createElement('div');
      item.className = 'fm-item' + (f.id === currentFileId ? ' active' : '');
      item.dataset.id = f.id;

      const meta = document.createElement('div');
      meta.className = 'fm-item-meta';
      const name = document.createElement('div');
      name.className = 'fm-item-name';
      name.textContent = f.name;
      const sub = document.createElement('div');
      sub.className = 'fm-item-sub';
      sub.textContent = `${fmtTime(f.updated)} · ${f.content.length} 字符`;
      meta.appendChild(name); meta.appendChild(sub);

      const actions = document.createElement('div');
      actions.className = 'fm-item-actions';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'fm-icon-btn';
      loadBtn.textContent = '打开';
      loadBtn.title = '加载到编辑器';
      loadBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        loadFile(f.id);
      });

      const renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.className = 'fm-icon-btn';
      renameBtn.textContent = '改名';
      renameBtn.title = '重命名';
      renameBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        renameFile(f.id);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'fm-icon-btn danger';
      delBtn.textContent = '删除';
      delBtn.title = '删除文件';
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        deleteFile(f.id);
      });

      actions.appendChild(loadBtn);
      actions.appendChild(renameBtn);
      actions.appendChild(delBtn);

      item.appendChild(meta);
      item.appendChild(actions);
      item.addEventListener('click', () => loadFile(f.id));

      fmList.appendChild(item);
    }
  }

  function newId() {
    return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function saveCurrentFile(name) {
    const files = readFiles();
    const now = Date.now();
    if (currentFileId) {
      const idx = files.findIndex((x) => x.id === currentFileId);
      if (idx >= 0) {
        files[idx].name = name;
        files[idx].content = editor.value;
        files[idx].updated = now;
        writeFiles(files);
        renderFileList();
        return currentFileId;
      }
    }
    // new file
    const id = newId();
    files.push({ id, name, content: editor.value, created: now, updated: now });
    writeFiles(files);
    currentFileId = id;
    localStorage.setItem('currentFileId', id);
    renderFileList();
    return id;
  }

  function loadFile(id) {
    const files = readFiles();
    const f = files.find((x) => x.id === id);
    if (!f) return;
    if (editor.value && editor.value !== f.content) {
      if (!confirm(`切换到「${f.name}」会丢弃当前编辑器未保存的修改，确定继续？`)) return;
    }
    editor.value = f.content;
    currentFileId = id;
    localStorage.setItem('currentFileId', id);
    persist();
    renderFileList();
    render();
  }

  function renameFile(id) {
    const files = readFiles();
    const f = files.find((x) => x.id === id);
    if (!f) return;
    const name = prompt('新文件名：', f.name);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    f.name = trimmed;
    f.updated = Date.now();
    writeFiles(files);
    renderFileList();
  }

  function deleteFile(id) {
    const files = readFiles();
    const f = files.find((x) => x.id === id);
    if (!f) return;
    if (!confirm(`确定删除文件「${f.name}」？`)) return;
    writeFiles(files.filter((x) => x.id !== id));
    if (currentFileId === id) {
      currentFileId = null;
      localStorage.removeItem('currentFileId');
    }
    renderFileList();
  }

  // Save button + collapse toggle
  fmToggle.addEventListener('click', () => {
    const collapsed = fmCell.classList.toggle('collapsed');
    fmArrow.classList.toggle('open', !collapsed);
    fmToggle.setAttribute('aria-expanded', String(!collapsed));
    applyLayout();
  });

  previewToggle.addEventListener('click', () => {
    const collapsed = previewCell.classList.toggle('collapsed');
    previewArrow.classList.toggle('open', !collapsed);
    previewToggle.setAttribute('aria-expanded', String(!collapsed));
    applyLayout();
  });

  saveBtn.addEventListener('click', () => {
    let defaultName = '';
    if (currentFileId) {
      const f = readFiles().find((x) => x.id === currentFileId);
      if (f) defaultName = f.name;
    }
    const name = prompt('保存为文件名：', defaultName || 'untitled.html');
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    saveCurrentFile(trimmed);
    // ensure file manager is open to show the saved file
    if (fmCell.classList.contains('collapsed')) {
      fmCell.classList.remove('collapsed');
      fmArrow.classList.add('open');
      fmToggle.setAttribute('aria-expanded', 'true');
    }
  });

  // initial render of list
  renderFileList();

  // apply persisted layout ratios (or defaults) once DOM is ready
  applyLayout();
  // re-apply on next frame so any browser late layout settles
  requestAnimationFrame(applyLayout);

  // ===== First render ==================================================
  render();

})();
