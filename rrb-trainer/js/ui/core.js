/* ============================================================
   UI CORE — DOM helpers, shared components, router, modal, toast
   ============================================================ */
import { SOURCES, SUBJECT_BY_ID, TOPIC_BY_ID, SUBJECTS } from '../syllabus.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

export const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  study: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  revision: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  guides: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/></svg>',
};

export const NAV = [
  { hash: '#/home', label: 'Home', icon: 'home' },
  { hash: '#/study', label: 'Study', icon: 'study' },
  { hash: '#/quiz', label: 'Quiz', icon: 'quiz' },
  { hash: '#/revision', label: 'Revision', icon: 'revision' },
  { hash: '#/progress', label: 'Progress', icon: 'progress' },
  { hash: '#/guides', label: 'Guides', icon: 'guides' },
  { hash: '#/more', label: 'More', icon: 'more' },
];

/* ---------- small components ---------- */
export function sourceChip(source) {
  const s = SOURCES[source] || SOURCES.EXPECTED;
  return `<span class="chip ${s.cls}" title="${esc(s.desc)}">${esc(s.label)}</span>`;
}
export function diffChip(d) {
  const map = { 1: ['EASY', 'green'], 2: ['MEDIUM', 'amber'], 3: ['HARD', 'red'] };
  const [t, c] = map[d] || map[2];
  return `<span class="chip ${c}">${t}</span>`;
}
export function statusChip(status) {
  const map = { NEW: 'gray', LEARNING: 'blue', WEAK: 'red', IMPROVING: 'amber', MASTERED: 'green' };
  return `<span class="chip ${map[status] || 'gray'}">${status}</span>`;
}
export function bar(pct, cls = '') {
  return `<div class="bar ${cls}"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`;
}
export function prow(label, pct, suffix = '%') {
  return `<div class="prow"><span class="plabel">${esc(label)}</span>${bar(pct)}<span class="pval">${pct}${suffix}</span></div>`;
}
export function subjectName(subjectId) { return SUBJECT_BY_ID[subjectId]?.short || subjectId; }
export function topicName(topicId) { return TOPIC_BY_ID[topicId]?.name || topicId; }

export function emptyState(icon, title, body, actionHTML = '') {
  return `<div class="empty"><div class="big">${icon}</div><b>${esc(title)}</b><p>${body}</p>${actionHTML}</div>`;
}

export function kvList(pairs) {
  return `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

/* ---------- toast & modal ---------- */
let toastTimer = null;
export function toast(msg, ms = 2600) {
  const root = $('#toast-root');
  root.innerHTML = `<div class="toast">${msg}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { root.innerHTML = ''; }, ms);
}

export function modal({ title, body, actions = [], onMount }) {
  const root = $('#modal-root');
  const id = 'm' + Date.now();
  root.innerHTML = `
    <div class="modal-veil" id="${id}">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${title}</h3>
        <div class="modal-body">${body}</div>
        <div class="row" style="justify-content:flex-end;margin-top:14px">${actions.map((a, i) =>
          `<button class="btn ${a.cls || ''}" data-mact="${i}">${a.label}</button>`).join('')}</div>
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  $(`#${id}`).addEventListener('click', (e) => { if (e.target.id === id && !$(id).dataset.lock) close(); });
  const btns = $$('[data-mact]', root);
  actions.forEach((a, i) => {
    btns[i].addEventListener('click', () => { const keep = a.onClick?.(close, root); if (!keep) close(); });
  });
  onMount?.(root);
  return close;
}

export function confirmModal(title, text, onYes, yesLabel = 'Yes, continue') {
  modal({ title, body: `<p>${text}</p>`, actions: [
    { label: 'Cancel' },
    { label: yesLabel, cls: 'primary', onClick: () => { onYes(); } },
  ] });
}

/* ---------- router ---------- */
const routes = [];
export function route(pattern, handler) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  routes.push({ rx, keys, handler });
}

export function nav(to) { location.hash = to; }

export function renderNav() {
  const cur = location.hash || '#/home';
  $('#bottomnav').innerHTML = `<div class="nav-inner">${NAV.map(n => `
    <button class="nav-item ${cur.startsWith(n.hash) && (n.hash !== '#/home' || cur === '#/home' || cur.startsWith('#/home')) ? 'active' : ''}"
      data-nav="${n.hash}" aria-label="${n.label}">${ICONS[n.icon]}<span>${n.label}</span></button>`).join('')}</div>`;
  $$('#bottomnav [data-nav]').forEach(b => b.addEventListener('click', () => nav(b.dataset.nav)));
}

let currentCleanup = null;
export async function render() {
  const hash = location.hash || '#/home';
  const path = hash.replace(/^#/, '');
  if (currentCleanup) { try { currentCleanup(); } catch (e) {} currentCleanup = null; }
  for (const r of routes) {
    const m = path.match(r.rx);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      try {
        const out = await r.handler(params);
        if (out && typeof out === 'function') currentCleanup = out;
      } catch (err) {
        console.error(err);
        $('#view').innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="small">${esc(err.message)}</p>
          <button class="btn primary" onclick="location.hash='#/home'">Go to Home</button></div>`;
      }
      renderNav();
      window.scrollTo(0, 0);
      return;
    }
  }
  nav('#/home');
}

export function setView(html) { $('#view').innerHTML = html; }
export function setTopbarActions(html) { $('#topbar-actions').innerHTML = html || ''; }

export function fmtDate(d) {
  const dt = new Date(d + (d.length === 10 ? 'T00:00:00' : ''));
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
export function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

export function actionButtons(list) {
  return `<div class="stack" style="gap:8px">${list.map(b =>
    `<button class="btn ${b.cls || ''} ${b.block ? 'block' : ''}" data-act="${b.id}" ${b.disabled ? 'disabled' : ''}>
      ${b.emoji ? `<span>${b.emoji}</span>` : ''}<span>${esc(b.label)}</span></button>`).join('')}</div>`;
}
export function bindActions(root, actions, handler) {
  $$('[data-act]', root).forEach(btn => btn.addEventListener('click', () => handler(btn.dataset.act, btn)));
}
