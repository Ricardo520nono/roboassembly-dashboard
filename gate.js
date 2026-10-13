'use strict';
// Only ciphertext is published. Decrypted files and their URLs live in memory.
const byId = id => document.getElementById(id);
const utf8 = new TextDecoder();
let objectUrls = [];
function base64Bytes(text) {
  const binary = atob(text);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function status(text, error = false) {
  byId('status').textContent = text;
  byId('status').classList.toggle('error', error);
}
async function fetchRequired(path, kind) {
  const response = await fetch(path, {cache: 'no-store'});
  if (!response.ok) throw new Error('NETWORK');
  return kind === 'json' ? response.json() : response.arrayBuffer();
}
async function hexDigest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
function releaseFiles() {
  byId('dashboard').removeAttribute('srcdoc');
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
}
// This function runs inside the decrypted dashboard, including for links
// created later by its existing step navigator, dialogs, and download list.
function frameAssets(urls, initialHash) {
  const attributes = ['src', 'href', 'poster'];
  function rewrite(root) {
    const elements = root.nodeType === 1 ? [root, ...root.querySelectorAll('[src],[href],[poster]')] : [...root.querySelectorAll('[src],[href],[poster]')];
    for (const element of elements) {
      for (const attribute of attributes) {
        const raw = element.getAttribute(attribute);
        if (!raw) continue;
        const path = raw.replace(/^\.\//, '');
        if (Object.hasOwn(urls, path)) {
          element.setAttribute(attribute, urls[path]);
          if (attribute === 'href' && element.hasAttribute('download') && !element.getAttribute('download')) element.setAttribute('download', path.split('/').pop());
        }
      }
    }
  }
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') rewrite(record.target);
      else for (const node of record.addedNodes) if (node.nodeType === 1) rewrite(node);
    }
  }).observe(document, {childList: true, subtree: true, attributes: true, attributeFilter: attributes});
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (href.startsWith('#')) {
      event.preventDefault();
      const target = document.getElementById(decodeURIComponent(href.slice(1)));
      target?.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    } else rewrite(anchor);
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    rewrite(document);
    if (initialHash) document.getElementById(decodeURIComponent(initialHash.slice(1)))?.scrollIntoView();
  });
}
function displayBundle(bundle) {
  if (bundle.version !== 1 || bundle.entry !== 'index.html' || !bundle.files?.[bundle.entry]) throw new Error('FORMAT');
  const urls = Object.create(null);
  for (const [path, file] of Object.entries(bundle.files)) {
    if (path === bundle.entry) continue;
    const url = URL.createObjectURL(new Blob([base64Bytes(file.data)], {type: file.mime}));
    urls[path] = url;
    objectUrls.push(url);
  }
  const html = utf8.decode(base64Bytes(bundle.files[bundle.entry].data));
  const documentCopy = new DOMParser().parseFromString(html, 'text/html');
  for (const element of documentCopy.querySelectorAll('[src],[href],[poster]')) {
    for (const attribute of ['src', 'href', 'poster']) {
      const raw = element.getAttribute(attribute);
      const path = raw?.replace(/^\.\//, '');
      if (path && Object.hasOwn(urls, path)) {
        element.setAttribute(attribute, urls[path]);
        if (attribute === 'href' && element.hasAttribute('download') && !element.getAttribute('download')) element.setAttribute('download', path.split('/').pop());
      }
    }
  }
  const setup = documentCopy.createElement('script');
  setup.textContent = `(${frameAssets.toString()})(${JSON.stringify(urls)},${JSON.stringify(location.hash)});`;
  documentCopy.head.prepend(setup);
  byId('dashboard').srcdoc = '<!doctype html>\n' + documentCopy.documentElement.outerHTML;
  byId('gate').hidden = true;
  byId('viewer').hidden = false;
  byId('password').value = '';
}
byId('unlock-form').addEventListener('submit', async event => {
  event.preventDefault();
  let password = byId('password').value;
  if (!password) return;
  byId('unlock').disabled = true;
  status('正在打开实验记录…');
  let decrypted = false;
  try {
    if (!globalThis.crypto?.subtle) throw new Error('BROWSER');
    const meta = await fetchRequired('vault.json', 'json');
    if (meta.version !== 1 || meta.kdf !== 'PBKDF2' || meta.hash !== 'SHA-256' || meta.cipher !== 'AES-GCM' || meta.payload !== 'vault.bin' || !Number.isInteger(meta.iterations) || meta.iterations < 100000 || meta.iterations > 1000000) throw new Error('FORMAT');
    const encrypted = await fetchRequired(meta.payload);
    if (encrypted.byteLength !== meta.ciphertextBytes || await hexDigest(encrypted) !== meta.ciphertextSha256) throw new Error('INTEGRITY');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    password = '';
    const key = await crypto.subtle.deriveKey({name:'PBKDF2',salt:base64Bytes(meta.salt),iterations:meta.iterations,hash:'SHA-256'}, material, {name:'AES-GCM',length:256}, false, ['decrypt']);
    const bytes = await crypto.subtle.decrypt({name:'AES-GCM',iv:base64Bytes(meta.iv),tagLength:128}, key, encrypted);
    decrypted = true;
    displayBundle(JSON.parse(utf8.decode(bytes)));
    status('');
  } catch (error) {
    releaseFiles();
    const wrongPassword = !decrypted && error.name === 'OperationError';
    status(wrongPassword ? '密码不正确，请重新输入。' : error.message === 'BROWSER' ? '请使用支持安全连接的现代浏览器打开。' : '暂时无法加载看板，请检查网络后重试。', true);
    byId('password').focus();
    if (wrongPassword) byId('password').select();
  } finally {
    password = '';
    byId('unlock').disabled = false;
  }
});
byId('toggle-password').addEventListener('click', () => {
  const showing = byId('password').type === 'password';
  byId('password').type = showing ? 'text' : 'password';
  byId('toggle-password').textContent = showing ? '隐藏' : '显示';
  byId('toggle-password').setAttribute('aria-label', showing ? '隐藏密码' : '显示密码');
  byId('toggle-password').setAttribute('aria-pressed', String(showing));
});
function lockDashboard() {
  releaseFiles();
  byId('viewer').hidden = true;
  byId('gate').hidden = false;
  byId('password').value = '';
  byId('password').type = 'password';
  byId('toggle-password').textContent = '显示';
  byId('toggle-password').setAttribute('aria-label', '显示密码');
  byId('toggle-password').setAttribute('aria-pressed', 'false');
  status('已锁定。');
  byId('password').focus();
}
byId('lock').addEventListener('click', lockDashboard);
window.addEventListener('pagehide', lockDashboard);
