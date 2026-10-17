'use strict';
/* =========================================================
   Archivos desactivados: Ajustes → Apariencia → "Archivos de la página".
   Va AL PRINCIPIO a propósito: con JavaScript desactivado, esta parte es lo único que se ejecuta
   (deja puesto el aviso y el atajo Ctrl + A, y corta el resto del archivo).

   - Se guarda en sessionStorage: sobrevive a recargar la página, pero al cerrar la pestaña todo vuelve a la normalidad.
   - Ctrl + A vuelve a activar TODOS los archivos (solo cuando hay alguno desactivado; si no, sigue siendo "Seleccionar todo").
   - Si la página tiene contraseña, no se desactiva nada (así no se puede esquivar el candado).
   ========================================================= */
const OFF_CSS_KEY = 'akon_off_css';
const OFF_JS_KEY  = 'akon_off_js';
const offRaw = k => { try{ return sessionStorage.getItem(k) === '1'; }catch(e){ return false; } };
const hasPageLock = () => { try{ const v = JSON.parse(localStorage.getItem('startpage_lock')); return !!(v && v.h && v.s); }catch(e){ return false; } };
const offActive = k => offRaw(k) && !hasPageLock();

// Apaga (o enciende) todas las hojas de estilo de la página
function setStylesDisabled(off){
  Array.from(document.styleSheets).forEach(sh => { try{ sh.disabled = off; }catch(e){} });
}
// Aviso fijo con estilos en línea (se ve aunque el CSS esté apagado)
function updateOffHint(){
  const css = offActive(OFF_CSS_KEY), js = offActive(OFF_JS_KEY);
  let box = document.getElementById('akonOffHint');
  if(!css && !js){ if(box) box.remove(); return; }
  if(!box){
    box = document.createElement('div');
    box.id = 'akonOffHint';
    box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;'
      + 'max-width:calc(100vw - 32px);padding:10px 16px;border-radius:12px;border:1px solid #777;background:#1b1a20;color:#fbfbfe;'
      + 'font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;';
    document.body.append(box);
  }
  box.textContent = (css && js ? 'CSS y JavaScript desactivados' : css ? 'CSS desactivado' : 'JavaScript desactivado')
    + '. Pulsa Ctrl + A para activar todos los archivos.';
}

document.addEventListener('keydown', e => {
  if(!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'a') return;
  if(!offRaw(OFF_CSS_KEY) && !offRaw(OFF_JS_KEY)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  try{ sessionStorage.removeItem(OFF_CSS_KEY); sessionStorage.removeItem(OFF_JS_KEY); }catch(err){}
  try{ sessionStorage.setItem('akon_skip_intro', '1'); }catch(err){}   // al reactivar, sin pantalla de carga
  location.reload();
}, true);

if(offActive(OFF_CSS_KEY)) setStylesDisabled(true);
updateOffHint();
if(offActive(OFF_JS_KEY)){
  // Sin JavaScript no hay pantalla de carga que la quite: se muestra la página tal cual y se corta aquí el archivo
  document.body.classList.remove('intro-active', 'intro-name');
  const introEl = document.getElementById('intro');
  if(introEl) introEl.remove();
  throw new Error('JavaScript desactivado desde Ajustes. Ctrl + A lo vuelve a activar.');
}

/* =========================================================
   Consentimiento de cookies / almacenamiento local.
   Va PRIMERO en este archivo, antes del código principal.

   - Sin aceptar (o si rechazas): NADA se guarda en el navegador. La página funciona durante la sesión,
     pero al recargar vuelve a sus valores originales. Los datos viejos se borran al rechazar.
   - Si aceptas: todo se guarda como siempre (tema, fondo, accesos directos, clima, buscador, historial).
   - Lo único que se guarda siempre es tu elección (startpage_consent), para no preguntarte en cada visita.

   Cómo funciona: intercepta localStorage (claves "startpage_*") y avisa a script_pc.js para IndexedDB.
   ========================================================= */
(() => {
  const CONSENT_KEY = 'startpage_consent';
  const PREFIX = 'startpage_';
  const proto = Storage.prototype;
  const orig = { get: proto.getItem, set: proto.setItem, rem: proto.removeItem };

  let LS = null;
  try{ LS = window.localStorage; }catch(e){}

  const mem = new Map();        // lo que se "guarda" solo durante esta sesión
  const removed = new Set();    // claves quitadas en la sesión (para limpiarlas si luego aceptas)
  let state = null;             // 'accepted' | 'rejected' | null (sin decidir)
  let when = 0;

  try{
    const c = JSON.parse(orig.get.call(LS, CONSENT_KEY));
    if(c && (c.v === 'accepted' || c.v === 'rejected')){ state = c.v; when = Number(c.at) || 0; }
  }catch(e){}

  const managed = (store, k) => store === LS && typeof k === 'string' && k.startsWith(PREFIX) && k !== CONSENT_KEY;

  proto.getItem = function(k){
    k = String(k);
    if(managed(this, k) && state !== 'accepted') return mem.has(k) ? mem.get(k) : null;
    return orig.get.call(this, k);
  };
  proto.setItem = function(k, v){
    k = String(k);
    if(managed(this, k) && state !== 'accepted'){ mem.set(k, String(v)); removed.delete(k); return; }
    return orig.set.call(this, k, v);
  };
  proto.removeItem = function(k){
    k = String(k);
    if(managed(this, k) && state !== 'accepted'){ mem.delete(k); removed.add(k); return; }
    return orig.rem.call(this, k);
  };

  // Borra todo lo guardado por la página (localStorage + imagen subida en IndexedDB)
  function purge(){
    try{
      const keys = [];
      for(let i = 0; i < LS.length; i++){ const k = LS.key(i); if(k && k.startsWith(PREFIX) && k !== CONSENT_KEY) keys.push(k); }
      keys.forEach(k => orig.rem.call(LS, k));
    }catch(e){}
    try{ if(window.indexedDB) indexedDB.deleteDatabase('startpage'); }catch(e){}
  }

  const listeners = [];
  function emit(){
    listeners.forEach(f => { try{ f(state); }catch(e){} });
    document.dispatchEvent(new CustomEvent('akon-consent', { detail: state }));
  }
  function saveChoice(v){
    state = v; when = Date.now();
    try{ orig.set.call(LS, CONSENT_KEY, JSON.stringify({ v, at: when })); }catch(e){}
  }

  function accept(){
    saveChoice('accepted');
    try{
      removed.forEach(k => orig.rem.call(LS, k));
      mem.forEach((v, k) => orig.set.call(LS, k, v));      // lo que ya personalizaste se guarda ahora
    }catch(e){}
    mem.clear(); removed.clear();
    emit();
  }
  function reject(){
    saveChoice('rejected');
    purge();
    emit();
  }

  // Bytes que ocupan los datos de la página (si no aceptaste cookies, lo que hay solo en memoria de la sesión)
  function usage(){
    let n = 0;
    try{
      if(state === 'accepted'){
        for(let i = 0; i < LS.length; i++){
          const k = LS.key(i);
          if(k && k.startsWith(PREFIX) && k !== CONSENT_KEY) n += (k.length + (orig.get.call(LS, k) || '').length) * 2;
        }
      }else mem.forEach((v, k) => { n += (k.length + v.length) * 2; });
    }catch(e){}
    return n;
  }

  window.AKON_CONSENT = {
    usage,
    state: () => state,
    accepted: () => state === 'accepted',
    when: () => when,
    accept, reject,
    onChange: f => listeners.push(f),
    openDetails: () => document.dispatchEvent(new CustomEvent('akon-open-settings', { detail: 'cookies' }))
  };

  if(state === 'rejected') purge();     // por si quedó algo de antes

  /* ---------- Aviso de cookies ---------- */
  let banner = null;
  function hideBanner(){
    if(!banner) return;
    const b = banner; banner = null;
    b.classList.remove('show');
    setTimeout(() => b.remove(), 400);
  }
  function showBanner(){
    if(banner || state) return;
    banner = document.createElement('div');
    banner.className = 'ck-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookies');
    banner.innerHTML =
      '<div class="ck-text"><strong>Cookies y almacenamiento</strong>' +
      '<p>Usamos el almacenamiento de tu navegador para recordar tu personalización: tema, fondo, accesos directos, clima, buscador e historial. ' +
      'Si las rechazas, no se guarda nada y la página vuelve a su estado original al recargar.</p>' +
      '<button type="button" class="ck-link">Ver qué se guarda</button></div>' +
      '<div class="ck-actions"><button type="button" class="ck-btn" data-a="reject">Rechazar</button>' +
      '<button type="button" class="ck-btn" data-a="accept">Aceptar</button></div>';
    banner.addEventListener('click', e => {
      const a = e.target.closest('[data-a]');
      if(a){ a.dataset.a === 'accept' ? accept() : reject(); return; }
      if(e.target.closest('.ck-link')) window.AKON_CONSENT.openDetails();
    });
    document.body.append(banner);
    requestAnimationFrame(() => requestAnimationFrame(() => banner && banner.classList.add('show')));
  }
  // Mismo estilo e importancia para Aceptar y Rechazar; el aviso se cierra solo al elegir (también desde Ajustes)
  AKON_CONSENT.onChange(hideBanner);

  function start(){
    if(state) return;
    // Espera a que termine la pantalla de inicio
    if(!document.body.classList.contains('intro-active')) return showBanner();
    const mo = new MutationObserver(() => {
      if(!document.body.classList.contains('intro-active')){ mo.disconnect(); setTimeout(showBanner, 500); }
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* =========================================================
   Start Page
   0. Seguridad (anti-XSS y limpieza de entradas)
   1. Configuración y elementos de la página
   2. Iconos que no cargan
   3. Reloj y saludo
   4. Texto animado de la barra de búsqueda
   5. Buscadores
   6. Búsquedas recientes y autocompletado
   7. Fondo de pantalla
   8. Eventos globales e inicio
   9. Ocultar la dirección de los enlaces
  10. Animación al hacer scroll
  11. Destello de las tarjetas que sigue al mouse
  12. Bloquear clic derecho
  13. Clima
  14. Accesos directos
  15. Buscador rápido (Ctrl + V)
  16. Pantalla de inicio
   ========================================================= */

// Preferencia de animaciones: se aplica antes que nada para que la intro no parpadee.
// 'true' = reducir, 'false' = animar aunque el sistema pida reducir, sin guardar = lo que diga el sistema.
try{
  const m = localStorage.getItem('startpage_motion');
  if(m === 'true' || (m === null && matchMedia('(prefers-reduced-motion: reduce)').matches))
    document.documentElement.classList.add('reduce-motion');
}catch(e){}
// Si hay contraseña, la página se oculta desde el primer instante (el candado de más abajo la pide)
try{
  const lk = JSON.parse(localStorage.getItem('startpage_lock'));
  if(lk && lk.h) document.documentElement.classList.add('locked');
}catch(e){}


/* ---------- Ctrl + R (o ⌘ + R): recarga la página SIN pantalla de carga ----------
   Va antes que el candado a propósito: así funciona siempre, incluso durante la pantalla de carga.
   Deja una marca en sessionStorage que startIntro (sección 16) lee al iniciar para saltarse la intro.
   La contraseña, si hay una, se sigue pidiendo. Ctrl + Shift + R sigue siendo la recarga normal del navegador. */
const SKIP_INTRO_KEY = 'akon_skip_intro';
document.addEventListener('keydown', e => {
  if(!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  if(e.key.toLowerCase() !== 'r' && e.code !== 'KeyR') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if(e.repeat) return;
  try{ sessionStorage.setItem(SKIP_INTRO_KEY, '1'); }catch(err){}
  location.reload();
}, true);

/* ---------- Ctrl + X (o ⌘ + X): entrar sin internet ----------
   Se salta la verificación de internet (la pantalla 106) y abre la página aunque no haya conexión.
   Se recuerda mientras la pestaña siga abierta. Dentro de un campo de texto sigue siendo "Cortar". */
const SKIP_OFFLINE_KEY = 'akon_skip_offline';
document.addEventListener('keydown', e => {
  if(!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  if(e.key.toLowerCase() !== 'x' && e.code !== 'KeyX') return;
  if(e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if(e.repeat) return;
  try{ sessionStorage.setItem(SKIP_OFFLINE_KEY, '1'); sessionStorage.setItem(SKIP_INTRO_KEY, '1'); }catch(err){}
  location.reload();
}, true);

/* ---------- Candado de la página: contraseña de 4 dígitos (Ajustes → Privacidad y datos) ----------
   Es un candado de privacidad para que nadie curiosee tu página: la contraseña se guarda cifrada (hash),
   pero vive en este navegador, así que no sustituye a una seguridad real. */
(function(){
  const LOCK_KEY = 'startpage_lock';
  const LEN = 4;
  const rm = () => { try{ return reducedMotion(); }catch(e){ return false; } };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const h = (tag, cls, text) => {
    const n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text != null) n.textContent = text;
    return n;
  };

  function read(){
    try{ const v = JSON.parse(localStorage.getItem(LOCK_KEY)); return v && v.h && v.s ? v : null; }catch(e){ return null; }
  }
  function write(v){ try{ localStorage.setItem(LOCK_KEY, JSON.stringify(v)); }catch(e){} }
  function erase(){ try{ localStorage.removeItem(LOCK_KEY); }catch(e){} }

  const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  const newSalt = () => {
    try{ return hex(crypto.getRandomValues(new Uint8Array(16))); }catch(e){ return String(Math.random()).slice(2) + Date.now(); }
  };
  async function hashPin(pin, salt){
    try{
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' }, key, 256);
      return 'p:' + hex(bits);
    }catch(e){
      // Navegador sin crypto.subtle: mezcla sencilla (menos fuerte, pero funciona)
      let a = 0x811c9dc5, b = 5381;
      const t = salt + ':' + pin + ':' + salt;
      for(let r = 0; r < 2000; r++) for(let i = 0; i < t.length; i++){
        a = Math.imul(a ^ t.charCodeAt(i), 16777619);
        b = (Math.imul(b, 33) ^ t.charCodeAt(i)) | 0;
      }
      return 'f:' + (a >>> 0).toString(16) + (b >>> 0).toString(16);
    }
  }

  let cur = null;        // candado abierto ahora mismo
  let pending = false;   // hay contraseña y todavía se está mostrando la pantalla de carga
  let introHandled = false;   // la pantalla de carga se encarga de abrir el candado (con el águila)

  // Mientras el candado está abierto, ninguna tecla llega a la página (Ctrl + V, atajos, Esc de Ajustes...)
  document.addEventListener('keydown', e => {
    if(!cur){ if(pending){ e.preventDefault(); e.stopImmediatePropagation(); } return; }
    if(!cur.root.contains(e.target)){ e.preventDefault(); e.stopImmediatePropagation(); cur.focus(); return; }
    if(e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); if(cur.cancelable) cur.cancel(); }
  }, true);

  function open(opts){
    if(cur) return;
    pending = false;
    const mode = opts.mode;                    // 'unlock' | 'verify' | 'set'
    const cancelable = !!opts.cancel;
    const prevFocus = document.activeElement;
    let step = 1, first = '', busy = false, fails = 0, timer = 0;

    const ov = h('div', 'lk');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Contraseña');
    const card  = h('div', 'lk-card');
    const title = h('div', 'lk-title'); title.setAttribute('role', 'heading'); title.setAttribute('aria-level', '2');
    const sub   = h('div', 'lk-sub');
    const stage = h('div', 'lk-stage');
    const rowEl = h('div', 'lk-boxes');
    const boxes = Array.from({ length: LEN }, (_, i) => {
      const b = h('input', 'lk-box');
      b.type = 'password'; b.inputMode = 'numeric'; b.maxLength = 1; b.autocomplete = 'off'; b.spellcheck = false;
      b.setAttribute('aria-label', 'Dígito ' + (i + 1) + ' de ' + LEN);
      return b;
    });
    rowEl.append(...boxes);
    const ringWrap = h('div', 'lk-ringwrap');
    ringWrap.innerHTML = '<svg class="lk-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="lk-ring-bg" cx="50" cy="50" r="42"/><circle class="lk-ring-fg" cx="50" cy="50" r="42"/></svg><span class="lk-pct">0</span><span class="lk-halo"></span>';
    const okWrap = h('div', 'lk-okwrap');
    okWrap.innerHTML = '<span class="lk-glow"></span><span class="lk-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5 12.5 10 17.5 19 7.5"/></svg></span><span class="lk-badge"></span>';
    stage.append(rowEl, ringWrap, okWrap);
    const foot = h('div', 'lk-foot');
    const msg  = h('span', 'lk-msg'); msg.setAttribute('aria-live', 'polite');
    foot.append(msg);
    if(cancelable){
      const c = h('button', 'lk-cancel', 'Cancelar'); c.type = 'button';
      c.addEventListener('click', () => api.cancel());
      foot.append(c);
    }
    // Con la pantalla de carga: aquí se posa el águila, arriba del recuadro
    const slot = opts.intro ? h('div', 'lk-logo-slot') : null;
    if(slot) card.append(slot);
    card.append(title, sub, stage, foot);
    ov.append(card);

    const ring = ringWrap.querySelector('.lk-ring-fg');
    const pct  = ringWrap.querySelector('.lk-pct');
    const CIRC = 2 * Math.PI * 42;
    ring.style.strokeDasharray = CIRC;
    ring.style.strokeDashoffset = CIRC;

    const OK = Object.assign(
      mode === 'set'
        ? { vt: 'Guardando…', vs: 'Protegiendo tu página.', ot: 'Contraseña guardada', os: 'Se pedirá cada vez que abras la página.', badge: 'ACTIVA' }
        : mode === 'verify'
        ? { vt: 'Verificando…', vs: 'Comprobando tu contraseña.', ot: 'Contraseña correcta', os: '', badge: 'VERIFICADO' }
        : { vt: 'Verificando…', vs: 'Comprobando tu contraseña.', ot: 'Acceso concedido', os: 'Bienvenido de nuevo.', badge: 'VERIFICADO' },
      opts.ok || {});

    function setText(){
      if(mode === 'set'){
        title.textContent = step === 1 ? 'Crea una contraseña' : 'Repite la contraseña';
        sub.textContent   = step === 1 ? 'Elige ' + LEN + ' dígitos para bloquear la página.' : 'Escríbela otra vez para confirmar.';
      }else{
        title.textContent = 'Introduce la contraseña';
        sub.textContent   = mode === 'verify' ? 'Confirma tu contraseña actual.' : 'Escribe tus ' + LEN + ' dígitos para entrar.';
      }
    }
    const say = (t, bad) => { msg.textContent = t || ''; msg.classList.toggle('bad', !!bad); };
    function clearBoxes(){ boxes.forEach(b => { b.value = ''; b.classList.remove('filled'); }); }
    function focusFirst(){
      if(busy) return;
      const b = boxes.find(x => !x.value && !x.disabled) || boxes[LEN - 1];
      b.focus();
    }
    function shake(t){
      say(t, true);
      rowEl.classList.remove('shake'); void rowEl.offsetWidth; rowEl.classList.add('shake');
      setTimeout(() => { clearBoxes(); busy = false; focusFirst(); }, rm() ? 0 : 420);
    }
    function lockout(){
      fails = 0;
      const until = Date.now() + 30000;
      boxes.forEach(b => { b.disabled = true; });
      const tick = () => {
        const s = Math.ceil((until - Date.now()) / 1000);
        if(s <= 0){ boxes.forEach(b => { b.disabled = false; }); say(''); clearBoxes(); busy = false; focusFirst(); return; }
        say('Demasiados intentos. Espera ' + s + ' s.', true);
        timer = setTimeout(tick, 500);
      };
      tick();
    }

    // Dispersa las casillas, cuenta del 0 al 100 y termina con el visto bueno
    async function runSuccess(){
      const fast = rm();
      say('');
      title.textContent = OK.vt; sub.textContent = OK.vs;
      if(!fast){
        // Las casillas se juntan en el centro, forman un círculo, giran alrededor y se encogen hacia el centro
        if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
        const sr = stage.getBoundingClientRect();
        const cx = sr.left + sr.width / 2, cy = sr.top + sr.height / 2;
        boxes.forEach(b => b.classList.add('orbit'));   // sin transiciones, para medir la posición real
        const items = boxes.map((b, i) => {
          const r = b.getBoundingClientRect();
          return { b, x0: r.left + r.width / 2 - cx, y0: r.top + r.height / 2 - cy,
                   base: i * (Math.PI / 2) - Math.PI / 2, tilt: (i % 2 ? 1 : -1) * (14 + Math.random() * 18) };   // cada casilla conserva su inclinación
        });
        const T1 = 380, T2 = 1300, T3 = 420, R = 52, SC = .72, TURNS = 1.35, TILT = 20;
        const easeOut = x => 1 - Math.pow(1 - x, 3);
        await new Promise(res => {
          const t0 = performance.now();
          const frame = now => {
            const t = now - t0;
            const spin = t <= T1 ? 0 : Math.min(1, (t - T1) / (T2 + T3)) * Math.PI * 2 * TURNS;
            items.forEach(it => {
              let x, y, sc = 1, op = 1;
              const ang = it.base + spin;
              if(t < T1){                                  // 1) se juntan en el centro
                const k = easeOut(t / T1);
                x = it.x0 * (1 - k); y = it.y0 * (1 - k); sc = 1 - .28 * k;
              }else if(t < T1 + T2){                       // 2) forman el círculo y giran
                const k = easeOut(Math.min(1, (t - T1) / 300));
                x = Math.cos(ang) * R * k; y = Math.sin(ang) * R * k; sc = SC;
              }else{                                       // 3) se encogen hacia el centro
                const k = Math.min(1, (t - T1 - T2) / T3), e = k * k;
                x = Math.cos(ang) * R * (1 - e); y = Math.sin(ang) * R * (1 - e); sc = SC * (1 - e); op = 1 - k * .6;
              }
              // La figura gira como una sola pieza: todas las casillas comparten inclinación y giran junto con el círculo
      const rot = TILT * Math.min(1, t / T1) + spin * 180 / Math.PI;
              it.b.style.transform = `translate(${(x - it.x0).toFixed(1)}px, ${(y - it.y0).toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${Math.max(sc, 0).toFixed(3)})`;
              it.b.style.opacity = op.toFixed(2);
            });
            t < T1 + T2 + T3 ? requestAnimationFrame(frame) : res();
          };
          requestAnimationFrame(frame);
        });
        boxes.forEach(b => { b.style.opacity = '0'; });
      }
      stage.classList.add('is-ring');
      if(fast){ pct.textContent = '100'; ring.style.strokeDashoffset = 0; await wait(120); }
      else{
        await new Promise(res => {
          const t0 = performance.now(), dur = 2000;
          const f = t => {
            const x = Math.min(1, (t - t0) / dur), p = 1 - Math.pow(1 - x, 2);
            pct.textContent = Math.round(p * 100);
            ring.style.strokeDashoffset = CIRC * (1 - p);
            x < 1 ? requestAnimationFrame(f) : res();
          };
          requestAnimationFrame(f);
        });
        await wait(150);
      }
      title.textContent = OK.ot; sub.textContent = OK.os;
      okWrap.querySelector('.lk-badge').textContent = OK.badge;
      stage.classList.remove('is-ring'); stage.classList.add('is-ok'); ov.classList.add('granted');
      if(!fast){
        for(let i = 0; i < 16; i++){
          const d = h('span', 'lk-dot'), a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 40;
          d.style.setProperty('--dx', Math.cos(a) * r + 'px'); d.style.setProperty('--dy', Math.sin(a) * r + 'px');
          d.style.setProperty('--ds', (3 + Math.random() * 4).toFixed(1) + 'px');
          okWrap.append(d); setTimeout(() => d.remove(), 1200);
        }
      }
      await wait(fast ? 150 : 1100);
    }

    async function submit(code){
      busy = true;
      if(mode === 'set'){
        if(step === 1){ first = code; step = 2; setText(); say(''); clearBoxes(); busy = false; focusFirst(); return; }
        if(code !== first){ step = 1; first = ''; setText(); shake('No coinciden. Vuelve a empezar.'); return; }
        const salt = newSalt();
        write({ s: salt, h: await hashPin(code, salt) });
      }else{
        const rec = read();
        const ok = !!rec && (await hashPin(code, rec.s)) === rec.h;
        if(!ok){
          fails++;
          if(fails >= 5){ rowEl.classList.remove('shake'); void rowEl.offsetWidth; rowEl.classList.add('shake'); lockout(); return; }
          shake('Contraseña incorrecta.');
          return;
        }
      }
      await runSuccess();
      close();
      if(opts.onDone) opts.onDone(true);
    }

    function close(){
      clearTimeout(timer);
      const node = ov;
      cur = null;
      document.documentElement.classList.remove('locked');
      node.classList.add('out');
      setTimeout(() => node.remove(), rm() ? 0 : 450);
      if(mode !== 'unlock' && prevFocus && prevFocus.focus){ try{ prevFocus.focus(); }catch(e){} }   // al desbloquear, la barra de búsqueda NO se activa sola
    }

    // Casillas
    function fill(digits){
      digits.split('').slice(0, LEN).forEach((d, i) => { boxes[i].value = d; boxes[i].classList.add('filled'); });
      if(digits.length >= LEN) submit(boxes.map(b => b.value).join(''));
      else focusFirst();
    }
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        const d = b.value.replace(/\D/g, '').slice(-1);
        b.value = d;
        b.classList.toggle('filled', !!d);
        if(!d) return;
        if(i < LEN - 1) boxes[i + 1].focus();
        else if(boxes.every(x => x.value) && !busy) submit(boxes.map(x => x.value).join(''));
      });
      b.addEventListener('keydown', e => {
        if(e.key === 'Backspace' && !b.value && i > 0){
          e.preventDefault(); boxes[i - 1].value = ''; boxes[i - 1].classList.remove('filled'); boxes[i - 1].focus();
        }else if(e.key === 'ArrowLeft' && i > 0){ e.preventDefault(); boxes[i - 1].focus(); }
        else if(e.key === 'ArrowRight' && i < LEN - 1){ e.preventDefault(); boxes[i + 1].focus(); }
      });
      b.addEventListener('paste', e => {
        e.preventDefault();
        if(busy) return;
        const t = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
        if(t) fill(t);
      });
      b.addEventListener('mousedown', e => { e.preventDefault(); focusFirst(); });
      b.addEventListener('focus', () => b.select());
    });

    // La luz sigue al puntero
    ov.addEventListener('pointermove', e => { ov.style.setProperty('--mx', e.clientX + 'px'); ov.style.setProperty('--my', e.clientY + 'px'); });
    // Nada de lo que se teclee aquí llega a la página
    ov.addEventListener('keydown', e => e.stopPropagation());

    const api = { root: ov, cancelable, focus: focusFirst, cancel: () => { if(busy) return; close(); } };
    cur = api;
    setText();
    document.body.append(ov);
    requestAnimationFrame(() => { ov.classList.add('show'); focusFirst(); });
    setTimeout(focusFirst, 80);
    return { slot };
  }

  window.AKON_LOCK = {
    has: () => !!read(),
    // La pantalla de carga lo usa: ¿hay que pedir la contraseña al terminar? y abrirla con un sitio para el águila
    pending: () => pending && !introHandled,
    showForIntro(){
      introHandled = true;
      let done; const unlocked = new Promise(r => { done = r; });
      const info = open({ mode: 'unlock', intro: true, onDone: () => done(true) });
      if(!info) done(false);   // el candado ya estaba abierto: no hay nada que esperar
      return { slot: info && info.slot, unlocked };
    },
    create: done => open({ mode: 'set', cancel: true, onDone: done }),
    change: done => open({ mode: 'verify', cancel: true, ok: { os: 'Ahora elige la nueva.' }, onDone: () => open({ mode: 'set', cancel: true, onDone: done }) }),
    remove: done => open({ mode: 'verify', cancel: true, ok: { ot: 'Contraseña quitada', os: 'La página ya no se bloqueará.', badge: 'QUITADA' }, onDone: () => { erase(); if(done) done(); } })
  };

  // Al abrir la página: si hay contraseña, se pide antes de mostrar nada
  try{
    if(read()){
      // Primero se muestra la pantalla de carga completa; la contraseña se pide cuando termina
      const go = () => open({ mode: 'unlock' });
      if(!document.body.classList.contains('intro-active')) go();
      else{
        pending = true;
        const mo = new MutationObserver(() => {
          if(!document.body.classList.contains('intro-active')){ mo.disconnect(); if(!introHandled) go(); }
        });
        mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }
    }else document.documentElement.classList.remove('locked');
  }catch(e){ document.documentElement.classList.remove('locked'); }
})();

/* ---------- 0. Seguridad (anti-XSS y limpieza de entradas) ---------- */
// Esta página es 100% estática: no hay base de datos ni servidor, así que una inyección SQL no tiene
// dónde ejecutarse aquí. Lo que sí se protege es: (1) que nada de lo que escribes o guardas se
// interprete como HTML/JS, (2) que solo se abran direcciones http(s), y (3) que el texto de entrada
// llegue limpio (sin caracteres de control ni longitudes absurdas), por si algún día lo envías a un servidor.
const SEC_MAX_QUERY = 200;

// Quita caracteres de control/invisibles peligrosos, normaliza y limita la longitud
function cleanText(value, max = SEC_MAX_QUERY){
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Devuelve la URL normalizada solo si es http(s); si no, null (bloquea javascript:, data:, vbscript:, file:...)
function safeHttpUrl(raw){
  try{
    const u = new URL(String(raw), location.href);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : null;
  }catch(e){
    return null;
  }
}

// Único punto por el que la página abre pestañas nuevas
function safeOpen(raw){
  const url = safeHttpUrl(raw);
  if(url) window.open(url, '_blank', 'noopener,noreferrer');
}

/* ---------- 1. Configuración y elementos de la página ---------- */
const MOTION_KEY = 'startpage_motion';   // 'true' = animaciones reducidas, 'false' = animadas, sin guardar = según el sistema
const ENGINES = {
  google:     { name: 'Google',         icon: 'images/Google.png',     url: 'https://www.google.com/search?q=', suggest: 'google' },
  bing:       { name: 'Bing',           icon: 'images/Bing.png',       url: 'https://www.bing.com/search?q=', suggest: 'ddg' },
  duckduckgo: { name: 'DuckDuckGo',     icon: 'images/DuckDuckGo.png', url: 'https://duckduckgo.com/?q=', suggest: 'ddg' },
  ebay:       { name: 'eBay',           icon: 'images/Ebay.png',       url: 'https://www.ebay.com/sch/i.html?_nkw=', suggest: null },
  perplexity: { name: 'Perplexity',     icon: 'images/Perplexity.png', url: 'https://www.perplexity.ai/search?q=', suggest: 'ddg' },
  wikipedia:  { name: 'Wikipedia (es)', icon: 'images/Wikipedia.png',  url: 'https://es.wikipedia.org/wiki/Special:Search?search=', suggest: 'wikipedia' },
  shodan:     { name: 'Shodan',         icon: 'images/Shodan.png',     url: 'https://www.shodan.io/search?query=', suggest: null }
};
const DEFAULT_ENGINE = 'google';

// Autocompletado: mientras escribes se piden sugerencias por internet (lo que escribes se envía
// a Google, DuckDuckGo o Wikipedia, según el buscador). Pon false para desactivarlo por completo.
// En ENGINES, "suggest" elige la fuente: 'google', 'ddg', 'wikipedia' o null (sin sugerencias).
const AUTOCOMPLETE   = true;
const SUGGEST_MAX    = 6;     // sugerencias que se muestran
const SUGGEST_DELAY  = 150;   // ms de pausa al teclear antes de preguntar

const HISTORY_KEY = 'startpage_history';
const HISTORY_MAX = 5;

const byId = id => document.getElementById(id);
const form         = byId('searchForm');
const input        = byId('q');
const engineBtn    = byId('engineBtn');
const engineMenu   = byId('engineMenu');
const engineMark   = byId('engineMark');
const historyMenu  = byId('historyMenu');
const historyList  = byId('historyList');
const historyHead  = historyMenu.querySelector('.history-head');
const clearHistBtn = byId('clearHistory');
const phOverlay    = byId('phOverlay');
const phText       = byId('phText');

let currentEngine = DEFAULT_ENGINE;

/* ---------- 2. Iconos que no cargan ---------- */
// Si una imagen falla, se oculta en lugar de mostrar el icono roto.
function hideImage(img){ img.style.display = 'none'; }

// El evento "error" no sube por el DOM, por eso se escucha en la fase de captura.
document.addEventListener('error', e => {
  if(e.target instanceof HTMLImageElement) hideImage(e.target);
}, true);
// Imágenes que ya fallaron antes de que este script se ejecutara
document.querySelectorAll('img').forEach(img => {
  if(img.complete && !img.naturalWidth) hideImage(img);
});

/* ---------- 3. Reloj y saludo ---------- */
const pad = n => String(n).padStart(2, '0');

function greetingFor(hour){
  if(hour < 6 || hour >= 19) return 'Buenas noches';
  return hour < 12 ? 'Buenos días' : 'Buenas tardes';
}

// Zona horaria del reloj (Ajustes → Hora). Sin elección guardada se usa la del dispositivo.
const TZ_KEY = 'startpage_timezone';
const TIMEZONES = [
  // [id, nombre, zona IANA]
  // América del Sur
  ['ar', 'Argentina', 'America/Argentina/Buenos_Aires'],
  ['bo', 'Bolivia', 'America/La_Paz'],
  ['br', 'Brasil (Brasilia)', 'America/Sao_Paulo'],
  ['br-am', 'Brasil (Manaos)', 'America/Manaus'],
  ['cl', 'Chile', 'America/Santiago'],
  ['co', 'Colombia', 'America/Bogota'],
  ['ec', 'Ecuador', 'America/Guayaquil'],
  ['gy', 'Guyana', 'America/Guyana'],
  ['py', 'Paraguay', 'America/Asuncion'],
  ['pe', 'Perú', 'America/Lima'],
  ['sr', 'Surinam', 'America/Paramaribo'],
  ['uy', 'Uruguay', 'America/Montevideo'],
  ['ve', 'Venezuela', 'America/Caracas'],
  // América del Norte
  ['ca-on', 'Canadá (Toronto)', 'America/Toronto'],
  ['ca-bc', 'Canadá (Vancouver)', 'America/Vancouver'],
  ['ca-ns', 'Canadá (Halifax)', 'America/Halifax'],
  ['us-ny', 'Estados Unidos (Nueva York)', 'America/New_York'],
  ['us-il', 'Estados Unidos (Chicago)', 'America/Chicago'],
  ['us-co', 'Estados Unidos (Denver)', 'America/Denver'],
  ['us-ca', 'Estados Unidos (Los Ángeles)', 'America/Los_Angeles'],
  ['us-ak', 'Estados Unidos (Alaska)', 'America/Anchorage'],
  ['us-hi', 'Estados Unidos (Hawái)', 'Pacific/Honolulu'],
  ['mx', 'México (Ciudad de México)', 'America/Mexico_City'],
  ['mx-qr', 'México (Cancún)', 'America/Cancun'],
  ['mx-son', 'México (Sonora)', 'America/Hermosillo'],
  ['mx-bc', 'México (Tijuana)', 'America/Tijuana'],
  // América Central
  ['bz', 'Belice', 'America/Belize'],
  ['cr', 'Costa Rica', 'America/Costa_Rica'],
  ['sv', 'El Salvador', 'America/El_Salvador'],
  ['gt', 'Guatemala', 'America/Guatemala'],
  ['hn', 'Honduras', 'America/Tegucigalpa'],
  ['ni', 'Nicaragua', 'America/Managua'],
  ['pa', 'Panamá', 'America/Panama'],
  // El Caribe
  ['ag', 'Antigua y Barbuda', 'America/Antigua'],
  ['bs', 'Bahamas', 'America/Nassau'],
  ['bb', 'Barbados', 'America/Barbados'],
  ['cu', 'Cuba', 'America/Havana'],
  ['dm', 'Dominica', 'America/Dominica'],
  ['gd', 'Granada', 'America/Grenada'],
  ['ht', 'Haití', 'America/Port-au-Prince'],
  ['jm', 'Jamaica', 'America/Jamaica'],
  ['do', 'República Dominicana', 'America/Santo_Domingo'],
  ['kn', 'San Cristóbal y Nieves', 'America/St_Kitts'],
  ['lc', 'Santa Lucía', 'America/St_Lucia'],
  ['vc', 'San Vicente y las Granadinas', 'America/St_Vincent'],
  ['tt', 'Trinidad y Tobago', 'America/Port_of_Spain']
];
const TZ_DEVICE_KEY = 'startpage_tz_device';     // 'false' = no usar la hora del dispositivo
const TIME_OFFSET_KEY = 'startpage_time_offset';  // desfase (ms) de la hora manual; sin guardar = hora real
const TZ_DEFAULT_ID = 'mx';
let clockTZ = null;       // [id, nombre, zona IANA] elegida (null = la del dispositivo)
let clockOffset = 0;      // ms que se suman a la hora real (hora manual)
function loadClockTZ(){
  let dev = true, id = null, off = 0;
  try{
    dev = localStorage.getItem(TZ_DEVICE_KEY) !== 'false';
    id  = localStorage.getItem(TZ_KEY);
    off = Number(localStorage.getItem(TIME_OFFSET_KEY));
  }catch(e){}
  clockTZ = dev ? null : (TIMEZONES.find(z => z[0] === id) || TIMEZONES.find(z => z[0] === TZ_DEFAULT_ID));
  clockOffset = Number.isFinite(off) ? off : 0;
}
const clockUsesDevice = () => !clockTZ;
function setClockDevice(on){
  try{ localStorage.setItem(TZ_DEVICE_KEY, on ? 'true' : 'false'); }catch(e){}
  loadClockTZ(); updateClock();
}
function setClockTZ(id){
  try{ localStorage.setItem(TZ_KEY, id); }catch(e){}
  loadClockTZ(); updateClock();
}
function clockTZChoice(){
  let id = null;
  try{ id = localStorage.getItem(TZ_KEY); }catch(e){}
  return TIMEZONES.some(z => z[0] === id) ? id : TZ_DEFAULT_ID;
}
// La hora escrita (de reloj de pared) en la zona mostrada -> instante real
function wallToEpoch(y, mo, d, h, mi, tz){
  if(!tz) return new Date(y, mo - 1, d, h, mi).getTime();
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
  const zoneOffset = ms => {
    const q = {};
    fmt.formatToParts(new Date(ms)).forEach(x => { q[x.type] = Number(x.value); });
    return Date.UTC(q.year, q.month - 1, q.day, q.hour % 24, q.minute, q.second) - Math.floor(ms / 1000) * 1000;
  };
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - zoneOffset(guess);
  t = guess - zoneOffset(t);
  return t;
}
// Usa la hora escrita como base: guarda cuánto se aparta de la hora real
function setManualTime(y, mo, d, h, mi){
  const target = wallToEpoch(y, mo, d, h, mi, clockTZ ? clockTZ[2] : undefined);
  try{ localStorage.setItem(TIME_OFFSET_KEY, String(target - Date.now())); }catch(e){}
  loadClockTZ(); updateClock();
}
function clearManualTime(){
  try{ localStorage.removeItem(TIME_OFFSET_KEY); }catch(e){}
  loadClockTZ(); updateClock();
}
loadClockTZ();

function updateClock(){
  const now = new Date(Date.now() + clockOffset);
  const tz  = clockTZ ? clockTZ[2] : undefined;
  let hour, minute;
  try{
    const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).formatToParts(now);
    hour   = Number(parts.find(p => p.type === 'hour').value) % 24;
    minute = Number(parts.find(p => p.type === 'minute').value);
  }catch(e){
    hour = now.getHours(); minute = now.getMinutes();
  }
  let date;
  try{ date = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }); }
  catch(e){ date = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  date = date.replace(/^./, c => c.toUpperCase());
  const tags = [clockTZ && clockTZ[1], clockOffset && 'hora manual'].filter(Boolean);

  byId('clockTime').textContent   = `${pad(hour % 12 || 12)}:${pad(minute)}`;
  byId('clockPeriod').textContent = hour >= 12 ? 'p. m.' : 'a. m.';
  byId('date').textContent        = tags.length ? `${date} · ${tags.join(' · ')}` : date;
  byId('greeting').textContent    = greetingFor(hour);
}

/* ---------- 4. Texto animado de la barra de búsqueda ---------- */
// El texto de ayuda ("Buscar con Google") se escribe letra por letra con una barrita.
// Mientras dura la animación se dibuja en una capa (phOverlay) encima del input;
// al terminar, el texto pasa a ser el placeholder normal.
//
// Estados:  typing  -> se está escribiendo
//           shown   -> el texto ya está completo
//           erasing -> se está borrando (por un clic o al empezar a escribir)
//           empty   -> no hay texto de ayuda: el usuario ya puede escribir
const hint = (() => {
  const TYPE_MS   = 55;    // ms por letra al escribir
  const ERASE_MS  = 28;    // ms por letra al borrar
  const LINGER_MS = 600;   // cuánto se queda la barrita al terminar de escribir

  let state   = 'shown';
  let timer   = null;
  let fullText = '';       // último texto pedido; es el que vuelve si sales de la barra
  let pending = '';        // letras tecleadas mientras el texto se borraba
  let next    = null;      // texto nuevo que se escribirá cuando termine de borrarse el actual


  // El cursor del sistema solo se oculta mientras haya texto de ayuda y nada escrito
  function sync(){
    input.classList.toggle('no-caret', !input.value && state !== 'empty');
  }

  function showOverlay(text){
    input.placeholder = '';   // mientras dura la animación, el texto vive en la capa
    phText.textContent = text;
    phOverlay.classList.add('on');
  }

  function stop(){
    clearTimeout(timer);
    phOverlay.classList.remove('on');
  }

  function setState(newState){
    state = newState;
    sync();
  }

  function type(text){
    stop();
    fullText = text;
    pending  = '';
    next     = null;
    if(reducedMotion()){
      input.placeholder = text;
      setState('shown');
      return;
    }

    setState('typing');
    showOverlay('');
    let i = 0;
    const step = () => {
      phText.textContent = text.slice(0, ++i);
      if(i < text.length){
        timer = setTimeout(step, TYPE_MS);
      }else{
        timer = setTimeout(() => {   // la barrita se queda un momento y desaparece
          stop();
          input.placeholder = text;
          setState('shown');
        }, LINGER_MS);
      }
    };
    timer = setTimeout(step, TYPE_MS);
  }

  function erase(){
    if(state === 'erasing' || state === 'empty' || input.value) return;

    let text = state === 'typing' ? phText.textContent : input.placeholder;
    stop();
    if(!text || reducedMotion()){ finishErase(); return; }

    setState('erasing');
    showOverlay(text);
    const step = () => {
      text = text.slice(0, -1);
      phText.textContent = text;
      timer = setTimeout(text ? step : finishErase, ERASE_MS);
    };
    timer = setTimeout(step, ERASE_MS);
  }

  function finishErase(){
    stop();
    input.placeholder = '';
    setState('empty');   // ya no hay nada: aparece el cursor del sistema
    flushPending();
    // Si el borrado venía de un cambio de buscador, ahora se escribe el texto nuevo
    // (salvo que el usuario ya haya empezado a escribir lo suyo)
    if(next){
      const text = next;
      next = null;
      if(!input.value) type(text);
    }
  }

  // Cambio de buscador: el texto de ayuda actual se borra letra por letra
  // y después se escribe el del buscador nuevo.
  function change(text){
    fullText = text;
    if(input.value) return;                 // el usuario ya escribió algo: no se toca nada
    if(state === 'empty'){ type(text); return; }   // no había texto que borrar
    next = text;
    erase();                                // si ya se estaba borrando, solo se actualiza "next"
  }

  // Después de borrar, se escribe lo que el usuario alcanzó a teclear
  function flushPending(){
    if(!pending) return;
    input.value = pending;
    pending = '';
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Un clic en la barra borra el texto de ayuda
  input.addEventListener('click', erase);

  // Si el usuario escribe sin hacer clic: primero se borra el texto y luego aparecen sus letras
  input.addEventListener('beforeinput', e => {
    if(e.inputType !== 'insertText' || !e.data) return;
    if(state === 'empty') return;
    if(input.value && state !== 'erasing') return;
    e.preventDefault();
    pending += e.data;
    erase();
  });

  input.addEventListener('input', () => {
    // Si se pegó texto en plena animación, se corta y se deja lo pegado
    if(input.value && (state === 'typing' || state === 'erasing')){
      stop();
      pending = '';
      state = 'empty';
    }
    sync();
  });

  // Si sales de la barra sin escribir nada, el texto se vuelve a escribir
  input.addEventListener('blur', () => {
    if((state === 'empty' || state === 'erasing') && !input.value) type(fullText);
  });

  return { type, change, sync };
})();

/* ---------- 5. Buscadores ---------- */
function buildEngineMenu(){
  for(const [i, [key, engine]] of Object.entries(ENGINES).entries()){
    const icon = new Image();
    icon.src = engine.icon;
    icon.alt = '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.engine = key;
    btn.setAttribute('role', 'option');
    btn.append(icon, engine.name);
    btn.addEventListener('click', () => setEngine(key));

    const item = document.createElement('li');
    item.append(btn);
    item.style.setProperty('--i', i);   // el CSS lo usa para que entren uno tras otro
    engineMenu.append(item);
  }
}

// Cada icono del buscador vive en su propia capa (.mark) para poder animar la transición.
// Si la imagen no carga, la capa muestra la inicial del buscador.
function makeMark(engine){
  const mark = document.createElement('span');
  mark.className = 'mark';

  const icon = new Image();
  icon.src = engine.icon;
  icon.alt = engine.name;
  icon.addEventListener('error', () => {
    mark.textContent = engine.name[0];
    mark.classList.add('fallback');
  });
  mark.append(icon);
  return mark;
}

// Transición: el icono anterior gira y se encoge mientras se desvanece,
// y el nuevo entra girando en sentido contrario con un pequeño rebote.
function renderEngineMark(engine, animate){
  const mark = makeMark(engine);
  const olds = [...engineMark.querySelectorAll('.mark')];
  const reduced = reducedMotion();

  if(!animate || reduced || !olds.length){
    engineMark.replaceChildren(mark);
    return;
  }

  // Salen todos los iconos que haya (si se cambia rápido puede haber más de uno)
  for(const old of olds){
    if(old.dataset.leaving) continue;
    old.dataset.leaving = '1';
    old.animate(
      [{ transform: 'rotate(-90deg) scale(.4)', opacity: 0, filter: 'blur(3px)' }],   // parte de donde esté
      { duration: 240, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }
    ).onfinish = () => old.remove();
  }

  engineMark.append(mark);
  mark.animate(
    [
      { transform: 'rotate(90deg) scale(.4)', opacity: 0, filter: 'blur(3px)' },
      { transform: 'rotate(0deg) scale(1)',   opacity: 1, filter: 'blur(0)'  }
    ],
    { duration: 460, delay: 90, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' }   // el rebote viene de esta curva
  );
}

let engineReady = false;   // pasa a true cuando ya se eligió el buscador inicial
function setEngine(key){
  const changed = key !== currentEngine;
  currentEngine = key;
  const engine = ENGINES[key];
  if(changed){                       // las sugerencias dependen del buscador
    clearSuggestions();
    if(input.value.trim()) scheduleSuggestions();
  }

  if(!engineReady || changed) renderEngineMark(engine, engineReady && changed);   // con animación solo al cambiar
  const text = `Buscar con ${engine.name}`;
  if(!engineReady) hint.type(text);            // al abrir la página: se escribe
  else if(changed) hint.change(text);          // al cambiar: se borra el anterior y se escribe el nuevo
  engineReady = true;
  engineMenu.querySelectorAll('button').forEach(btn => {
    const isCurrent = btn.dataset.engine === key;
    btn.classList.toggle('current', isCurrent);
    btn.setAttribute('aria-selected', isCurrent);
  });
  closeEngineMenu();
  input.focus();
}

// Buscadores ocultos desde Ajustes → Buscar (no salen en el menú de la barra)
const HIDDEN_ENGINES_KEY = 'startpage_hidden_engines';
function hiddenEngines(){
  try{
    const a = JSON.parse(localStorage.getItem(HIDDEN_ENGINES_KEY) || '[]');
    const list = Array.isArray(a) ? a.filter(k => typeof k === 'string' && ENGINES[k]) : [];
    return list.length >= Object.keys(ENGINES).length ? [] : list;   // siempre queda al menos uno
  }catch(e){ return []; }
}
function applyEngineVisibility(){
  const hid = hiddenEngines();
  engineMenu.querySelectorAll('button').forEach(b => { b.parentElement.hidden = hid.includes(b.dataset.engine); });
  if(hid.includes(currentEngine)){
    const first = Object.keys(ENGINES).find(k => !hid.includes(k));
    if(first) setEngine(first);
  }
}

/* Celular: los menús que se abren bajo la barra de búsqueda (buscadores y recientes) terminan siempre ANTES de la barra
   de navegación de abajo; si no caben, se desplazan por dentro. En computadora no se toca nada. */
function fitMenuAboveNav(menu){
  const nav = byId('mnav');
  if(document.documentElement.dataset.device !== 'mobile' || !nav){
    menu.style.maxHeight = ''; menu.style.overflowY = ''; menu.style.overscrollBehavior = '';
    return;
  }
  const top = form.getBoundingClientRect().bottom + (menu === engineMenu ? 8 : 0);   // donde empieza el menú
  const avail = nav.getBoundingClientRect().top - top - 12;                          // hasta 12 px antes de la barra
  menu.style.maxHeight = Math.max(120, Math.floor(avail)) + 'px';
  menu.style.overflowY = 'auto';
  menu.style.overscrollBehavior = 'contain';
}
function refitOpenMenus(){
  if(engineMenu.classList.contains('open')) fitMenuAboveNav(engineMenu);
  if(historyMenu.classList.contains('open')) fitMenuAboveNav(historyMenu);
}
window.addEventListener('resize', refitOpenMenus);
window.addEventListener('scroll', refitOpenMenus, { passive: true });

function openEngineMenu(){
  closeHistory();
  engineMenu.classList.add('open');
  engineBtn.setAttribute('aria-expanded', 'true');
  fitMenuAboveNav(engineMenu);
}
function closeEngineMenu(){
  engineMenu.classList.remove('open');
  engineBtn.setAttribute('aria-expanded', 'false');
}

engineBtn.addEventListener('click', () => {
  engineMenu.classList.contains('open') ? closeEngineMenu() : openEngineMenu();
});

/* ---------- 6. Búsquedas recientes ---------- */
const CLOCK_SVG = '<svg class="h-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>';
let activeIdx = -1;

const historyButtons = () => historyList.querySelectorAll('button');

function loadHistory(){
  try{
    const items = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if(!Array.isArray(items)) return [];
    return items
      .filter(i => i && typeof i.q === 'string' && ENGINES[i.engine])
      .map(i => ({ q: cleanText(i.q), engine: i.engine }))
      .filter(i => i.q)
      .slice(0, HISTORY_MAX);
  }catch(e){
    return [];
  }
}

function saveHistory(items){
  try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); }catch(e){}
}

function addHistory(q, engine){
  // Si la misma búsqueda ya existía, sube al primer lugar en vez de duplicarse
  const items = loadHistory().filter(i =>
    !(i.q.toLowerCase() === q.toLowerCase() && i.engine === engine));
  items.unshift({ q, engine });
  saveHistory(items.slice(0, HISTORY_MAX));
}

// Lo que escribes filtra las recientes; con la barra vacía se ven todas
function visibleHistory(){
  const term = input.value.trim().toLowerCase();
  return loadHistory().filter(i => !term || i.q.toLowerCase().includes(term));
}

/* --- Autocompletado --- */
const SUGGEST_SOURCES = {
  google: {
    url:   q => 'https://suggestqueries.google.com/complete/search?client=chrome&hl=es&q=' + encodeURIComponent(q),
    // Responde ["texto", ["sugerencia 1", "sugerencia 2", ...], ...]
    parse: data => Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [],
    fallback: 'ddg'    // si el navegador bloquea la petición a Google, se usa DuckDuckGo
  },
  ddg: {
    url:   q => 'https://duckduckgo.com/ac/?type=list&q=' + encodeURIComponent(q),
    // type=list responde ["texto", ["sugerencia 1", "sugerencia 2", ...]]
    parse: data => Array.isArray(data) && Array.isArray(data[1]) ? data[1] : []
  },
  wikipedia: {
    url:   q => 'https://es.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&namespace=0&limit='
                + SUGGEST_MAX + '&search=' + encodeURIComponent(q),
    parse: data => Array.isArray(data) && Array.isArray(data[1]) ? data[1] : []
  }
};

let suggestions   = [];     // sugerencias vigentes (se muestran bajo las recientes)
let suggestTimer  = null;
let suggestAbort  = null;
const suggestCache = new Map();   // "fuente|texto" -> lista, para no repetir peticiones

async function requestSuggestions(src, q, signal){
  const res = await fetch(src.url(q), { signal });
  if(!res.ok) throw new Error('Sugerencias: ' + res.status);
  return src.parse(await res.json())
    .filter(t => typeof t === 'string' && t.trim())
    .slice(0, SUGGEST_MAX);
}

async function fetchSuggestions(q, sourceKey, signal){
  const key = `${sourceKey}|${q.toLowerCase()}`;
  if(suggestCache.has(key)) return suggestCache.get(key);

  const src = SUGGEST_SOURCES[sourceKey];
  let list;
  if(src.broken){
    list = await requestSuggestions(SUGGEST_SOURCES[src.fallback], q, signal);
  }else{
    try{
      list = await requestSuggestions(src, q, signal);
    }catch(e){
      if(signal.aborted || !src.fallback) throw e;
      list = await requestSuggestions(SUGGEST_SOURCES[src.fallback], q, signal);
      src.broken = true;   // el respaldo sí funcionó: la fuente principal está bloqueada, no se insiste
    }
  }
  suggestCache.set(key, list);
  return list;
}

function clearSuggestions(){
  clearTimeout(suggestTimer);
  suggestAbort?.abort();
  suggestions = [];
}

// Se llama en cada tecla: espera una pausa corta y pide las sugerencias del texto actual.
// Si algo falla (sin internet, bloqueo del navegador) simplemente no se muestran y todo sigue igual.
function scheduleSuggestions(){
  clearTimeout(suggestTimer);
  suggestAbort?.abort();

  const q = input.value.trim();
  const sourceKey = ENGINES[currentEngine].suggest;
  if(!AUTOCOMPLETE || !q || !sourceKey){ suggestions = []; return; }

  suggestTimer = setTimeout(async () => {
    const ctrl = new AbortController();
    suggestAbort = ctrl;
    try{
      const list = await fetchSuggestions(q, sourceKey, ctrl.signal);
      if(ctrl.signal.aborted) return;
      suggestions = list;
      if(document.activeElement === input) openHistory();   // vuelve a dibujar el menú
    }catch(e){}
  }, SUGGEST_DELAY);
}

// Sugerencias sin las que ya aparecen como recientes
function visibleSuggestions(historyItems){
  const seen = new Set(historyItems.map(i => i.q.toLowerCase()));
  return suggestions.filter(t => !seen.has(t.toLowerCase()));
}

function runSearch(q, engineKey){
  // Todo se trata como texto de búsqueda, nunca como dirección ni como algo a "ejecutar".
  q = cleanText(q);
  if(!q || !ENGINES[engineKey]) return;
  clearSuggestions();
  addHistory(q, engineKey);
  safeOpen(ENGINES[engineKey].url + encodeURIComponent(q));
  input.value = '';
  hint.sync();
  closeHistory();
}

const SEARCH_SVG = '<svg class="h-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line></svg>';

function renderHistory(animate = false){
  const items = visibleHistory();
  const extra = visibleSuggestions(items);
  const term  = input.value.trim();
  historyList.textContent = '';
  activeIdx = -1;

  // "Búsquedas recientes" solo se ve si hay recientes que mostrar
  historyHead.classList.toggle('hidden', items.length === 0);

  const addRow = (i, btn) => {
    const li = document.createElement('li');
    li.append(btn);
    li.style.setProperty('--i', i);
    if(animate) li.classList.add('enter');   // entrada escalonada (solo cuando el menú se abre)
    historyList.append(li);
  };

  for(const [i, item] of items.entries()){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'option');
    btn.dataset.q = item.q;
    btn.innerHTML = CLOCK_SVG;           // contenido fijo, no viene del usuario

    const query = document.createElement('span');
    query.className = 'h-query';
    query.textContent = item.q;          // textContent: nunca se interpreta como HTML

    const engine = document.createElement('span');
    engine.className = 'h-engine';
    engine.textContent = ENGINES[item.engine].name;

    btn.append(query, engine);
    btn.addEventListener('click', () => runSearch(item.q, item.engine));
    addRow(i, btn);
  }

  for(const [j, text] of extra.entries()){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggest';
    btn.setAttribute('role', 'option');
    btn.dataset.q = text;
    btn.innerHTML = SEARCH_SVG;

    // Lo que ya escribiste queda normal y lo que falta para completar va en negritas
    const query = document.createElement('span');
    query.className = 'h-query';
    if(term && text.toLowerCase().startsWith(term.toLowerCase())){
      const rest = document.createElement('b');
      rest.textContent = text.slice(term.length);
      query.append(text.slice(0, term.length), rest);
    }else{
      query.textContent = text;
    }

    btn.append(query);
    btn.addEventListener('click', () => runSearch(text, currentEngine));
    addRow(items.length + j, btn);
  }
  return items.length + extra.length > 0;
}

function openHistory(){
  const wasOpen = historyMenu.classList.contains('open');   // si ya estaba abierto (escribiendo), no se repite la entrada
  if(!renderHistory(!wasOpen)){ closeHistory(); return; }
  closeEngineMenu();
  historyMenu.classList.add('open');
  form.classList.add('expanded');
  fitMenuAboveNav(historyMenu);
}

function closeHistory(){
  historyMenu.classList.remove('open');
  form.classList.remove('expanded');
  activeIdx = -1;
}

function setActive(idx){
  const buttons = historyButtons();
  buttons.forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  activeIdx = idx;
  if(buttons[idx]){
    buttons[idx].classList.add('active');
    buttons[idx].setAttribute('aria-selected', 'true');
    buttons[idx].scrollIntoView({ block: 'nearest' });
  }
}

input.addEventListener('click', openHistory);
input.addEventListener('input', () => {
  scheduleSuggestions();
  openHistory();
});

input.addEventListener('keydown', e => {
  const isOpen = historyMenu.classList.contains('open');
  const count  = historyButtons().length;

  if(e.key === 'ArrowDown'){
    e.preventDefault();
    if(!isOpen){ openHistory(); return; }
    setActive(activeIdx + 1 >= count ? 0 : activeIdx + 1);
  }else if(e.key === 'ArrowUp' && isOpen){
    e.preventDefault();
    setActive(activeIdx <= 0 ? count - 1 : activeIdx - 1);
  }else if(e.key === 'ArrowRight' && isOpen && input.value
           && input.selectionStart === input.value.length && input.selectionEnd === input.value.length){
    // Flecha derecha al final del texto: completa con la sugerencia marcada (o la primera) sin buscar
    const buttons = historyButtons();
    const pick = (buttons[activeIdx]?.classList.contains('suggest') && buttons[activeIdx])
              || historyList.querySelector('button.suggest');
    if(pick){
      e.preventDefault();
      input.value = pick.dataset.q;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }else if(e.key === 'Enter' && isOpen && activeIdx >= 0){
    e.preventDefault();
    historyButtons()[activeIdx].click();
  }
});

clearHistBtn.addEventListener('click', () => {
  saveHistory([]);
  closeHistory();
  input.focus();
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const q = input.value.trim();
  if(q) runSearch(q, currentEngine);
});

/* ---------- 7. Panel "Personalizar" (temas, fondos y accesos directos) ---------- */
const bgBtn   = byId('bgBtn');
const bgPanel = byId('bgPanel');
const bgClose = byId('bgClose');

function openBgPanel(){
  bgPanel.classList.add('open');
  bgPanel.setAttribute('aria-hidden', 'false');
  bgBtn.classList.add('shifted');   // se corre para no quedar tapado por el panel
  bgBtn.setAttribute('aria-expanded', 'true');
}
function closeBgPanel(){
  bgPanel.classList.remove('open');
  bgPanel.setAttribute('aria-hidden', 'true');
  bgBtn.classList.remove('shifted');
  bgBtn.setAttribute('aria-expanded', 'false');
}
bgBtn.addEventListener('click', () => {
  bgPanel.classList.contains('open') ? closeBgPanel() : openBgPanel();
});
bgClose.addEventListener('click', closeBgPanel);

/* --- Despliegue animado (lo usan la paleta de colores y el selector de filas) ---
   Anima altura, márgenes, relleno, borde y opacidad entre "cerrado" y su tamaño natural, así lo que
   queda debajo sube o baja con suavidad. Si se vuelve a pulsar a media animación, invierte desde donde va. */
const REVEAL_PROPS = ['height', 'marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth', 'opacity'];
const REVEAL_ZERO = { height: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px',
                      borderTopWidth: '0px', borderBottomWidth: '0px', opacity: 0 };
function revealSnap(el){
  const cs = getComputedStyle(el);
  const out = {};
  REVEAL_PROPS.forEach(p => { out[p] = cs[p]; });
  return out;
}
function toggleReveal(el, show, animate = true){
  let start = null;
  if(el._rev){ start = revealSnap(el); el._rev.cancel(); el._rev = null; el.style.overflow = ''; }
  const hiddenNow = el.style.display === 'none';
  if(!animate || reducedMotion()){ el.style.display = show ? '' : 'none'; return; }
  if(show){
    if(hiddenNow) el.style.display = '';
    const full = revealSnap(el);
    el.style.overflow = 'hidden';
    const a = el.animate([start || REVEAL_ZERO, full], { duration: 460, easing: SC_EASE_OUT });
    a.onfinish = () => { el.style.overflow = ''; el._rev = null; };
    el._rev = a;
  }else{
    if(hiddenNow) return;
    const from = start || revealSnap(el);
    el.style.overflow = 'hidden';
    const a = el.animate([from, REVEAL_ZERO], { duration: 380, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
    a.onfinish = () => { el.style.display = 'none'; el.style.overflow = ''; a.cancel(); el._rev = null; };
    el._rev = a;
  }
}

/* --- 7.0 Modo claro / oscuro --- */
// Sin elección guardada se usa el modo del sistema; el interruptor del panel guarda la elección.
const MODE_KEY = 'startpage_mode';
const modeToggle = byId('modeToggle');
const modeLabel = byId('modeLabel');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
let modeTimer = 0;

function savedMode(){
  try{
    const m = localStorage.getItem(MODE_KEY);
    if(m === 'dark' || m === 'light') return m;
  }catch(e){}
  return null;
}
function applyMode(mode, animate){
  const root = document.documentElement;
  if(animate && !reducedMotion()){
    root.classList.add('mode-anim');
    clearTimeout(modeTimer);
    modeTimer = setTimeout(() => root.classList.remove('mode-anim'), 600);
  }
  root.dataset.mode = mode;
  document.querySelectorAll('.mode-switch input').forEach(cb => { cb.checked = (mode === 'dark'); });
  if(modeLabel) modeLabel.textContent = mode === 'dark' ? 'Modo oscuro' : 'Modo claro';
}
function setMode(mode, origin){
  try{ localStorage.setItem(MODE_KEY, mode); }catch(e){}
  if(origin){
    origin.classList.remove('go'); void origin.offsetWidth; origin.classList.add('go');
    setTimeout(() => origin.classList.remove('go'), 1000);
  }
  // Círculo que crece desde el botón; sin soporte o con "reducir animaciones", fundido simple
  if(origin && document.startViewTransition && !reducedMotion()){
    const r = origin.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(() => applyMode(mode, false));
    vt.ready.then(() => {
      document.documentElement.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + end + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 750, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
  }else{
    applyMode(mode, true);
  }
}
if(modeToggle){
  modeToggle.addEventListener('change', () => setMode(modeToggle.checked ? 'dark' : 'light'));
}
// Si no hay elección guardada, sigue los cambios del sistema en vivo
systemDark.addEventListener('change', e => { if(!savedMode()) applyMode(e.matches ? 'dark' : 'light', true); });
applyMode(savedMode() || (systemDark.matches ? 'dark' : 'light'), false);

/* --- 7.1 Apariencia (color de tema) --- */
// "default" sigue el color normal de la página (cambia solo con el modo claro/oscuro).
// Los demás son colores fijos, iguales en modo claro y oscuro.
const THEMES = [
  { id: 'default' },
  { id: 'brick',  color: '#8a4a3a' },
  { id: 'purple', color: '#7a4ba0' },
  { id: 'blue',   color: '#3b5fc4' },
  { id: 'green',  color: '#1f8a5a' },
  { id: 'gray',   color: '#6b6f76' },
];
const THEME_KEY = 'startpage_theme';
const themeSwatches = byId('themeSwatches');
const CUSTOM_PREFIX = 'custom:';
const HEX_RE = /^#[0-9a-f]{6}$/i;

// Paleta de 60 colores: 5 filas de 10 tonos (de oscuro a claro) + 1 fila de grises
function hslToHex(h, s, l){
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
const PALETTE = (() => {
  const out = [];
  for(const l of [28, 38, 48, 58, 68])
    for(let h = 0; h < 360; h += 36) out.push(hslToHex(h, 70, l));
  for(let i = 0; i < 10; i++) out.push(hslToHex(0, 0, 10 + i * 9));
  return out;
})();

let customBtn = null;
let palette = null;

function applyTheme(id){
  let color = null;
  let isCustom = false;
  if(id.startsWith(CUSTOM_PREFIX) && HEX_RE.test(id.slice(CUSTOM_PREFIX.length))){
    color = id.slice(CUSTOM_PREFIX.length);
    isCustom = true;
  }else{
    const theme = THEMES.find(t => t.id === id) || THEMES[0];
    id = theme.id;
    color = theme.color || null;
  }
  // El tema solo pinta contornos (tarjetas, buscador e historial) mediante --theme-color; el texto no cambia
  const root = document.documentElement;
  root.style.removeProperty('--accent');
  if(color) root.style.setProperty('--theme-color', color);
  else root.style.removeProperty('--theme-color');
  root.classList.toggle('has-theme', !!color);

  themeSwatches.querySelectorAll('button[data-theme]').forEach(b =>
    b.classList.toggle('selected', !isCustom && b.dataset.theme === id));
  if(customBtn){
    customBtn.classList.toggle('selected', isCustom);
    customBtn.classList.toggle('has-color', isCustom);
    customBtn.style.setProperty('--more-color', isCustom ? color : 'transparent');   // puntito con el color elegido
  }
  if(palette)
    palette.querySelectorAll('button').forEach(b =>
      b.classList.toggle('selected', isCustom && b.dataset.color.toLowerCase() === color.toLowerCase()));
}
function setTheme(id){
  applyTheme(id);
  try{ localStorage.setItem(THEME_KEY, id); }catch(e){}
}
function buildThemeSwatches(){
  for(const theme of THEMES){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cz-swatch' + (theme.id === 'default' ? ' default' : '');
    btn.dataset.theme = theme.id;
    if(theme.color) btn.style.background = theme.color;
    btn.setAttribute('aria-label', 'Tema ' + theme.id);
    btn.addEventListener('click', () => setTheme(theme.id));
    themeSwatches.append(btn);
  }

  // Fila "Ver más colores": abre la vista con la paleta completa
  customBtn = document.createElement('button');
  customBtn.type = 'button';
  customBtn.className = 'cz-more-themes';
  customBtn.setAttribute('aria-label', 'Ver más colores');
  customBtn.innerHTML = '<span class="cz-more-label">Ver más colores</span><span class="cz-more-dot" aria-hidden="true"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg>';
  themeSwatches.append(customBtn);

  palette = document.createElement('div');
  palette.className = 'cz-palette';
  palette.setAttribute('role', 'group');
  palette.setAttribute('aria-label', 'Paleta de colores');
  for(const color of PALETTE){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cz-pcolor';
    b.dataset.color = color;
    b.style.background = color;
    b.setAttribute('aria-label', 'Color ' + color);
    b.addEventListener('click', () => setTheme(CUSTOM_PREFIX + color));
    palette.append(b);
  }

  // Vista "Más colores" a panel completo (como en Firefox): flecha para volver + título + la paleta
  themeView = document.createElement('div');
  themeView.className = 'theme-view-box';
  const head = document.createElement('div');
  head.className = 'bgp-head';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'bgp-back';
  back.setAttribute('aria-label', 'Volver');
  back.innerHTML = svgIcon('<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>');
  back.addEventListener('click', closeThemeView);
  const title = document.createElement('span');
  title.className = 'bgp-title';
  title.textContent = 'Más colores';
  head.append(back, title);
  themeView.append(head, palette);
  themeSwatches.closest('.cz-scroll').append(themeView);

  customBtn.addEventListener('click', openThemeView);
}

/* Entrar y salir de la vista "Más colores": todo lo demás del panel se desvanece y queda solo esa vista */
let themeView = null, themeBusy = false;
function themeOthers(){
  return [...bgPanel.querySelectorAll('.cz-head, .cz-foot, .cz-scroll > .cz-section')];
}
function openThemeView(){
  if(themeBusy || bgPanel.classList.contains('theme-view')) return;
  const scroller = bgPanel.querySelector('.cz-scroll');
  if(reducedMotion()){
    bgPanel.classList.add('theme-view');
    scroller.scrollTop = 0;
    return;
  }
  themeBusy = true;
  const outs = themeOthers().map(el => el.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-28px)' }],
    { duration: 170, easing: 'ease-in', fill: 'forwards' }));
  setTimeout(() => {
    outs.forEach(a => a.cancel());
    bgPanel.classList.add('theme-view');
    scroller.scrollTop = 0;
    themeView.animate(
      [{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'none' }],
      { duration: 380, easing: SC_EASE_OUT });
    // Los colores aparecen en ola, en diagonal desde la esquina superior izquierda
    [...palette.children].forEach((b, i) => b.animate(
      [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'none' }],
      { duration: 400, delay: 90 + (Math.floor(i / 10) + (i % 10)) * 26, easing: SC_EASE_POP, fill: 'backwards' }));
    themeBusy = false;
  }, 170);
}
function closeThemeView(){
  if(themeBusy || !bgPanel.classList.contains('theme-view')) return;
  const scroller = bgPanel.querySelector('.cz-scroll');
  if(reducedMotion()){
    bgPanel.classList.remove('theme-view');
    scroller.scrollTop = 0;
    return;
  }
  themeBusy = true;
  const out = themeView.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(28px)' }],
    { duration: 170, easing: 'ease-in', fill: 'forwards' });
  setTimeout(() => {
    out.cancel();
    bgPanel.classList.remove('theme-view');
    scroller.scrollTop = 0;
    themeOthers().forEach(el => el.animate(
      [{ opacity: 0, transform: 'translateX(-28px)' }, { opacity: 1, transform: 'none' }],
      { duration: 380, easing: SC_EASE_OUT, fill: 'backwards' }));
    themeBusy = false;
  }, 170);
}

/* --- 7.2 Fondos de pantalla --- */
// Los fondos se organizan en categorías. Cada categoría es una subcarpeta dentro de
// "images/fondos-preguardados":
//   images/fondos-preguardados/oficiales/    -> fondos oficiales del buscador
//   images/fondos-preguardados/abstractos/
//   images/fondos-preguardados/celestial/
//   images/fondos-preguardados/fotografias/
//   images/fondos-preguardados/colores/
// Para agregar un fondo: solo copia la imagen (PNG, JPG, JPEG o WebP, con cualquier nombre) a su carpeta
// y recarga la página; se detecta sola (ver "Detección automática" más abajo). Ya no hace falta
// escribir el nombre en "files". La lista "files" sirve solo para fijar un orden propio al inicio.
// Para una categoría nueva, crea su carpeta y copia un bloque { ... }.
// La vista previa de cada categoría en el panel es su primera imagen.
const BG_CATEGORIES = [
  { id: 'oficiales',  name: 'Oficiales',   folder: 'oficiales/',  files: [
    'fondo1.jpg', 'fondo2.jpg', 'fondo3.jpg', 'fondo4.jpg', 'fondo5.jpg',
    'fondo6.jpg', 'fondo7.jpg', 'fondo8.jpg', 'fondo9.jpg', 'fondo10.jpg',
    'fondo11.jpg', 'fondo12.jpg', 'fondo13.jpg', 'fondo14.jpg', 'fondo15.jpg',
  ] },
  { id: 'abstractos', name: 'Abstractos',  folder: 'abstractos/', files: [] },
  { id: 'celestial',  name: 'Celestial',   folder: 'celestial/',  files: [] },
  { id: 'fotografias', name: 'Fotografías', folder: 'fotografias/', files: [] },
  { id: 'colores',    name: 'Colores',     folder: 'colores/',    files: [] },
];
const BG_FOLDER        = 'images/fondos-preguardados/';
const BG_KEY           = 'startpage_background';     // ruta dentro de BG_FOLDER (ej. "oficiales/fondo1.jpg"), "color:#rrggbb" o "custom:image" (tu imagen subida)
const BG_COLOR_KEY     = 'startpage_bg_color';       // el último color que elegiste con el gotero
const BG_ENABLED_KEY   = 'startpage_bg_enabled';
const BG_CUSTOM_KEY    = 'startpage_custom_bg';       // (versión anterior) imagen guardada como texto en localStorage; se migra sola
const CUSTOM_BG_ID     = 'custom:image';              // identifica tu imagen subida (el archivo vive en IndexedDB)
const BG_MAX_UPLOAD_MB = 1024;                        // 1 GB
const BG_DISPLAY_MAX   = 3840;                        // lado más largo con el que se guarda la imagen para mostrarla (4K)

/* --- Detección automática de las imágenes de cada carpeta ---
   Formatos aceptados: PNG, JPG, JPEG y WebP.
   - Con un servidor local que muestre el contenido de las carpetas (Live Server de VS Code,
     "python -m http.server"...) se leen las carpetas y vale CUALQUIER nombre.
   - Abierta con doble clic (file://) el navegador no deja leer carpetas, así que se prueban los nombres
     fondo1, fondo2, fondo3... (en cualquiera de los 4 formatos) hasta que faltan 5 números seguidos.
     Numera los archivos nuevos sin dejar huecos grandes: fondo1.png, fondo2.webp, fondo3.jpg... */
const BG_EXTS = /\.(png|jpe?g|webp)$/i;
const bgNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

function bgAddFiles(cat, names){
  let added = false;
  for(const name of names){
    if(typeof name === 'string' && BG_EXTS.test(name) && !cat.files.includes(name)){ cat.files.push(name); added = true; }
  }
  return added;
}

// Comprueba si existe una imagen cargándola (funciona también con file://)
const bgProbe = url => new Promise(done => {
  const img = new Image();
  img.onload = () => done(true);
  img.onerror = () => done(false);
  img.src = url;
});

// Comprueba si un archivo existe SIN descargarlo (petición HEAD: solo pregunta, no baja la imagen).
// Antes cada fondo se descargaba completo solo para saber si existía, y eso hacía lenta la pantalla de inicio.
const bgServed = /^https?:$/.test(location.protocol);
const bgExists = async url => {
  if(!bgServed) return bgProbe(url);                       // con file:// no hay servidor al que preguntar
  try{
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });   // sin caché: siempre pregunta al servidor si el nombre existe ahora
    if(r.status === 404 || r.status === 410) return false;
    if(r.ok){
      const t = r.headers.get('content-type') || '';
      return !t || /^image\//i.test(t) || t === 'application/octet-stream';   // un 200 con HTML no es una imagen
    }
  }catch(e){}
  return bgProbe(url);                                     // el servidor no acepta HEAD: se prueba cargándola
};

// Prueba fondo1, fondo2... en cada formato; se detiene tras 5 números seguidos sin imagen
async function bgProbeFolder(cat){
  const exts = ['.png', '.jpg', '.jpeg', '.webp'];
  const BATCH = 6;                                          // números que se revisan a la vez
  let changed = false, miss = 0, n = 1;
  while(n <= 300 && miss < 5){
    const nums = Array.from({ length: Math.min(BATCH, 301 - n) }, (_, k) => n + k);
    const rows = await Promise.all(nums.map(async num => {
      const hits = await Promise.all(exts.map(async ext => {
        const name = 'fondo' + num + ext;
        return (await bgExists(bgImage(cat.folder + name).slice(5, -2))) ? name : null;
      }));
      return hits.filter(Boolean);
    }));
    for(const found of rows){                               // se cuentan en orden: se detiene tras 5 números seguidos sin imagen
      miss = found.length ? 0 : miss + 1;
      if(bgAddFiles(cat, found)) changed = true;
      if(miss >= 5) break;
    }
    n += BATCH;
  }
  return changed;
}

// Lee el listado que muestra el servidor local; si no hay listado (o es file://), prueba los nombres fondoN
async function bgScanFolders(){
  const served = /^https?:$/.test(location.protocol);
  let changed = false;
  await Promise.all(BG_CATEGORIES.map(async cat => {
    let listed = false;
    if(served){
      try{
        const res = await fetch(BG_FOLDER + cat.folder, { cache: 'no-store' });
        if(res.ok){
          listed = true;
          const html = await res.text();
          const names = [...html.matchAll(/href="([^"?#]+)"/gi)].map(m => {
            try{ return decodeURIComponent(m[1].split('/').filter(Boolean).pop() || ''); }catch(e){ return ''; }
          }).sort(bgNatural.compare);
          if(bgAddFiles(cat, names)) changed = true;
        }
      }catch(e){}
    }
    if(!listed && await bgProbeFolder(cat)) changed = true;
  }));
  // Si el panel está en la vista de inicio, refresca las vistas previas
  if(changed && bgHome && !bgBusy && bgCat.style.display === 'none') renderBgHome();
}

const bgGrid      = byId('bgGrid');
const bgToggle    = byId('bgToggle');
const bgFileInput = byId('bgFileInput');

const isCustomBg = file => file === CUSTOM_BG_ID;
const isColorBg  = file => typeof file === 'string' && /^color:#[0-9a-f]{6}$/i.test(file);
const bgEnabled  = () => { try{ return localStorage.getItem(BG_ENABLED_KEY) !== 'false'; }catch(e){ return true; } };

// Un fondo guardado antes de las categorías ("fondo3.jpg") ahora vive en la carpeta de oficiales
function normalizeBg(file){
  if(!file || isCustomBg(file) || isColorBg(file) || file.includes('/')) return file;
  const official = BG_CATEGORIES[0];
  return official.files.includes(file) ? official.folder + file : file;
}

// Valor CSS de background-image para un fondo (imagen de carpeta, imagen subida o color liso)
function bgImage(file){
  if(isColorBg(file)){ const c = file.slice(6); return `linear-gradient(${c}, ${c})`; }
  if(isCustomBg(file)) return customUrl ? `url("${customUrl}")` : 'none';
  // versión anterior, antes de migrarse: solo se acepta una imagen en base64 (sin comillas ni nada que rompa el CSS)
  if(file.startsWith('data:')) return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(file) ? `url("${file}")` : 'none';
  // rutas de carpeta: sin ".." ni caracteres raros (evita salirse de la carpeta o inyectar CSS)
  if(file.split('/').some(p => p === '..' || p === '.') || /[\\\u0000-\u001F"'()]/.test(file)) return 'none';
  return `url("${BG_FOLDER + file.split('/').map(encodeURIComponent).join('/')}")`;   // el nombre puede llevar espacios, # o acentos
}

let bgCurrent = null;   // fondo elegido en este momento
let customUrl = null;   // dirección temporal (blob:) de tu imagen subida, una vez leída de IndexedDB

// Marca como elegido lo que corresponda en el panel
function updateBgSelection(){
  bgGrid.querySelectorAll('[data-bg]').forEach(el =>
    el.classList.toggle('selected', el.dataset.bg === (bgCurrent || '')));
  bgGrid.querySelectorAll('[data-cat]').forEach(el => {
    const cat = BG_CATEGORIES.find(c => c.id === el.dataset.cat);
    el.classList.toggle('selected', Boolean(bgCurrent && cat && bgCurrent.startsWith(cat.folder)));
  });
  const pick = bgGrid.querySelector('.bgp-pick');
  if(pick){
    const on = isColorBg(bgCurrent);
    pick.classList.toggle('selected', on);
    pick.querySelector('.bgp-prev').style.background = on ? bgCurrent.slice(6) : '';
  }
}

/* El fondo se dibuja en capas fijas detrás de la página (.bg-stage > .bg-layer), no en el body, para poder animarlo:
   - al cambiar de fondo, el nuevo entra con un fundido suave (acercamiento + desenfoque que se aclara) sobre el anterior;
   - al activar el interruptor, el fondo se revela con una entrada más lenta y amplia;
   - al desactivarlo, la imagen se desvanece, se desenfoca y se aleja mientras la página recupera sus colores.
   Al iniciar la página (sin animación) el fondo aparece directo. Con "reducir movimiento" nunca se anima. */
const bgStage = document.createElement('div');
bgStage.className = 'bg-stage';
bgStage.setAttribute('aria-hidden', 'true');
document.body.prepend(bgStage);

let bgShownKey = null;   // qué fondo se está mostrando (o null si ninguno)
let bgToken = 0;         // para ignorar cambios viejos si eliges otro antes de que termine el anterior
let bgFadeTimer = 0;

const BG_MOTION = {
  switch:  { dur: 1000, from: { opacity: 0, transform: 'scale(1.06)', filter: 'blur(10px)' } },
  enable:  { dur: 1400, from: { opacity: 0, transform: 'scale(1.14)', filter: 'blur(16px)' } },
};
const BG_EASE = 'cubic-bezier(.22,1,.36,1)';
const BG_REST = { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' };

// Espera a que la imagen esté cargada y decodificada, para que el fundido no empiece con la capa vacía
function bgPreload(file){
  return new Promise(done => {
    const m = isColorBg(file) ? null : /^url\("(.*)"\)$/.exec(bgImage(file));
    if(!m) return done();
    const img = new Image();
    let ended = false;
    const end = () => { if(!ended){ ended = true; done(); } };
    img.onload = () => { (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(end); };
    img.onerror = end;
    setTimeout(end, 2500);
    img.src = m[1];
  });
}

function bgRender(file, show, motion){
  const key = show ? file + (isCustomBg(file) ? '|' + customUrl : '') : null;
  if(key === bgShownKey) return;
  bgShownKey = key;
  const token = ++bgToken;
  const animate = Boolean(motion) && !reducedMotion();
  const layers = () => [...bgStage.children];

  if(animate){
    document.body.classList.add('bg-fading');          // los colores de la página cambian suavemente a la vez
    clearTimeout(bgFadeTimer);
    bgFadeTimer = setTimeout(() => document.body.classList.remove('bg-fading'), 1700);
  }

  // Quitar el fondo: la capa visible se desvanece
  if(!show){
    for(const old of layers()){
      if(!animate){ old.remove(); continue; }
      old.getAnimations().forEach(a => a.cancel());
      old.animate([BG_REST, { opacity: 0, transform: 'scale(1.07)', filter: 'blur(12px)' }],
                  { duration: 800, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).onfinish = () => old.remove();
    }
    return;
  }

  const layer = document.createElement('div');
  layer.className = 'bg-layer';
  layer.style.backgroundImage = bgImage(file);

  if(!animate){
    layers().forEach(old => old.remove());
    bgStage.append(layer);
    return;
  }

  const cfg = BG_MOTION[motion] || BG_MOTION.switch;
  bgPreload(file).then(() => {
    if(token !== bgToken) return;                       // ya elegiste otro fondo
    bgStage.append(layer);                              // queda encima del anterior
    layer.animate([cfg.from, BG_REST], { duration: cfg.dur, easing: BG_EASE }).onfinish = () => {
      if(token !== bgToken) return;
      layers().filter(l => l !== layer).forEach(old => old.remove());
    };
  });
}

// Pinta el fondo elegido (o lo quita) sin tocar lo guardado.
// motion: 'switch' (cambio de fondo) o 'enable' (al activar el interruptor); sin él, aparece directo
function applyBackground(file, motion){
  file = file ? normalizeBg(file) : null;
  bgCurrent = file;
  const show = Boolean(file) && bgEnabled() && (!isCustomBg(file) || Boolean(customUrl));
  document.body.style.backgroundImage = '';
  document.body.classList.toggle('has-bg', show);
  updateBgSelection();
  bgRender(file, show, motion);
}

// Elige un fondo y lo recuerda para la próxima vez que abras la página
function setBackground(file){
  const hadCustom = isCustomBg(bgCurrent);
  applyBackground(file, 'switch');
  try{
    if(bgCurrent) localStorage.setItem(BG_KEY, bgCurrent);
    else localStorage.removeItem(BG_KEY);
  }catch(e){}
  // Tu imagen subida solo vive mientras sea el fondo: al elegir otro (oficial, foto, color o ninguno) se borra
  if(hadCustom && !isCustomBg(bgCurrent)) discardCustomBg();
}

/* Panel de fondos al estilo del de Firefox: una vista de inicio con tarjetas de vista previa
   (Añadir imagen, tu imagen, cada categoría y "Sin fondo") y, al elegir una categoría, una vista con
   todos sus fondos y una flecha para volver. Al cambiar de vista la anterior se desliza y se
   desvanece, la caja se ajusta de alto y las tarjetas nuevas entran en cascada. */
let bgHome = null, bgCat = null, bgBusy = false;

function svgIcon(inner){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// Tarjeta con vista previa; label puede omitirse (en la vista de una categoría no lleva texto)
function makeTile({ label, image, icon, ariaLabel, onClick }){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bgp-tile';
  if(ariaLabel || label) btn.setAttribute('aria-label', ariaLabel || label);
  const prev = document.createElement('span');
  prev.className = 'bgp-prev';
  if(image) prev.style.backgroundImage = image;
  else prev.classList.add('bgp-empty');
  if(icon) prev.innerHTML = icon;
  btn.append(prev);
  if(label){
    const text = document.createElement('span');
    text.className = 'bgp-label';
    text.textContent = label;
    btn.append(text);
  }
  btn.addEventListener('click', onClick);
  return btn;
}

function renderBgHome(){
  bgHome.textContent = '';

  const add = makeTile({ label: 'Añadir imagen', icon: svgIcon('<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>'),
                         onClick: () => bgFileInput.click() });
  add.classList.add('bgp-add');
  bgHome.append(add);

  // La última imagen que subiste queda disponible para volver a elegirla
  if(customUrl){
    const t = makeTile({ label: 'Tu imagen', image: bgImage(CUSTOM_BG_ID), onClick: () => setBackground(CUSTOM_BG_ID) });
    t.dataset.bg = CUSTOM_BG_ID;
    bgHome.append(t);
  }

  for(const cat of BG_CATEGORIES){
    const first = cat.files[0];
    const t = makeTile({ label: cat.name, image: first ? bgImage(cat.folder + first) : null, onClick: () => openBgCategory(cat.id) });
    t.dataset.cat = cat.id;
    bgHome.append(t);
  }

  const none = makeTile({ label: 'Sin fondo', icon: svgIcon('<circle cx="12" cy="12" r="8"></circle><line x1="6.3" y1="17.7" x2="17.7" y2="6.3"></line>'),
                          onClick: () => setBackground(null) });
  none.dataset.bg = '';
  bgHome.append(none);
  updateBgSelection();
}

/* Selector de color propio (sin ventana del sistema): cuadro de saturación/brillo, barra de tono y
   campo de código. Cada cambio se aplica como fondo al instante y se recuerda. */
const clamp01 = n => Math.min(1, Math.max(0, n));
function hsvToHex(h, s, v){
  const f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
function hexToHsv(hex){
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if(d){
    if(max === r) h = ((g - b) / d + 6) % 6;
    else if(max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: h * 60, s: max ? d / max : 0, v: max };
}

function buildColorEditor(){
  let startHex = '#4a90d9';
  try{ startHex = localStorage.getItem(BG_COLOR_KEY) || startHex; }catch(e){}
  if(isColorBg(bgCurrent)) startHex = bgCurrent.slice(6);
  if(!/^#[0-9a-f]{6}$/i.test(startHex)) startHex = '#4a90d9';
  let { h, s, v } = hexToHsv(startHex);

  const box = document.createElement('div');
  box.className = 'bgp-editor';
  box.style.display = 'none';

  const sv = document.createElement('div');
  sv.className = 'bgp-sv';
  sv.tabIndex = 0;
  sv.setAttribute('role', 'slider');
  sv.setAttribute('aria-label', 'Saturación y brillo');
  const handle = document.createElement('span');
  handle.className = 'bgp-sv-handle';
  sv.append(handle);

  const hue = document.createElement('input');
  hue.type = 'range';
  hue.min = 0; hue.max = 360; hue.step = 1;
  hue.className = 'bgp-hue';
  hue.setAttribute('aria-label', 'Tono');

  const row = document.createElement('div');
  row.className = 'bgp-hexrow';
  const swatch = document.createElement('span');
  swatch.className = 'bgp-swatch';
  const hex = document.createElement('input');
  hex.type = 'text';
  hex.className = 'bgp-hex';
  hex.maxLength = 7;
  hex.spellcheck = false;
  hex.autocomplete = 'off';
  hex.setAttribute('aria-label', 'Código del color');
  row.append(swatch, hex);

  box.append(sv, hue, row);

  function paint(fromHex){
    const color = hsvToHex(h, s, v);
    sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h}, 100%, 50%))`;
    handle.style.left = (s * 100) + '%';
    handle.style.top = ((1 - v) * 100) + '%';
    handle.style.background = color;
    hue.value = Math.round(h);
    swatch.style.background = color;
    if(!fromHex) hex.value = color;
    return color;
  }
  function commit(fromHex){
    const color = paint(fromHex);
    try{ localStorage.setItem(BG_COLOR_KEY, color); }catch(e){}
    setBackground('color:' + color);
  }

  function pointSv(e){
    const r = sv.getBoundingClientRect();
    s = clamp01((e.clientX - r.left) / r.width);
    v = 1 - clamp01((e.clientY - r.top) / r.height);
    commit();
  }
  sv.addEventListener('pointerdown', e => { e.preventDefault(); sv.focus(); sv.setPointerCapture(e.pointerId); pointSv(e); });
  sv.addEventListener('pointermove', e => { if(sv.hasPointerCapture(e.pointerId)) pointSv(e); });
  sv.addEventListener('keydown', e => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if(e.key === 'ArrowLeft') s = clamp01(s - step);
    else if(e.key === 'ArrowRight') s = clamp01(s + step);
    else if(e.key === 'ArrowUp') v = clamp01(v + step);
    else if(e.key === 'ArrowDown') v = clamp01(v - step);
    else return;
    e.preventDefault();
    commit();
  });
  hue.addEventListener('input', () => { h = Number(hue.value); commit(); });
  hex.addEventListener('input', () => {
    const text = (hex.value.startsWith('#') ? hex.value : '#' + hex.value).toLowerCase();
    if(/^#[0-9a-f]{6}$/.test(text)){ ({ h, s, v } = hexToHsv(text)); commit(true); }
  });
  hex.addEventListener('blur', () => { hex.value = hsvToHex(h, s, v); });

  paint();
  return box;
}

function renderBgCategory(cat){
  bgCat.textContent = '';

  const head = document.createElement('div');
  head.className = 'bgp-head';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'bgp-back';
  back.setAttribute('aria-label', 'Volver');
  back.innerHTML = svgIcon('<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>');
  back.addEventListener('click', closeBgCategory);
  const title = document.createElement('span');
  title.className = 'bgp-title';
  title.textContent = cat.name;
  head.append(back, title);

  const grid = document.createElement('div');
  grid.className = 'bgp-grid';
  for(const file of cat.files){
    const path = cat.folder + file;
    const t = makeTile({ image: bgImage(path), ariaLabel: file, onClick: () => setBackground(path) });
    t.dataset.bg = path;
    grid.append(t);
  }

  // En "Colores": la tarjeta del gotero despliega, dentro del mismo recuadro, un selector de color propio
  let editor = null;
  if(cat.id === 'colores'){
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'bgp-tile bgp-pick';
    pick.setAttribute('aria-label', 'Elegir otro color');
    pick.setAttribute('aria-expanded', 'false');
    const prev = document.createElement('span');
    prev.className = 'bgp-prev';
    prev.innerHTML = svgIcon('<path d="m2 22 1-1h3l9-9"></path><path d="M3 21v-3l9-9"></path><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"></path>');
    pick.append(prev);
    editor = buildColorEditor();
    pick.addEventListener('click', () => {
      const open = pick.getAttribute('aria-expanded') !== 'true';
      pick.setAttribute('aria-expanded', String(open));
      toggleReveal(editor, open);
      // Si queda fuera de la vista, el panel baja solo para mostrarlo
      if(open) setTimeout(() => editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 280);
    });
    grid.append(pick);
  }

  if(!grid.children.length){
    const empty = document.createElement('p');
    empty.className = 'bgp-none';
    empty.textContent = 'Todavía no hay fondos aquí.';
    grid.append(empty);
  }
  bgCat.append(head, grid);
  if(editor) bgCat.append(editor);
  updateBgSelection();
}

// Cambia entre la vista de inicio y la de una categoría. dir: 1 = entrar, -1 = volver
function swapBgView(fromEl, toEl, render, dir){
  if(bgBusy) return;
  if(reducedMotion()){
    render();
    fromEl.style.display = 'none';
    toEl.style.display = '';
    return;
  }
  bgBusy = true;
  const startH = bgGrid.offsetHeight;
  if(bgGrid._anim){ bgGrid._anim.cancel(); bgGrid._anim = null; }
  fromEl.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 28}px)` }],
    { duration: 170, easing: 'ease-in', fill: 'forwards' }
  );
  setTimeout(() => {
    fromEl.getAnimations().forEach(a => a.cancel());
    fromEl.style.display = 'none';
    render();
    toEl.style.display = '';
    bgBusy = false;

    const endH = bgGrid.offsetHeight;
    bgGrid.style.overflow = 'hidden';
    const a = bgGrid.animate([{ height: startH + 'px' }, { height: endH + 'px' }], { duration: 440, easing: SC_EASE_OUT });
    a.onfinish = () => { bgGrid.style.overflow = ''; bgGrid._anim = null; };
    bgGrid._anim = a;

    toEl.animate(
      [{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 380, easing: SC_EASE_OUT }
    );
    toEl.querySelectorAll('.bgp-tile, .bgp-head').forEach((el, i) => el.animate(
      [{ opacity: 0, transform: 'translateY(12px) scale(.9)' }, { opacity: 1, transform: 'none' }],
      { duration: 420, delay: 60 + Math.min(i, 12) * 35, easing: SC_EASE_OUT, fill: 'backwards' }
    ));
  }, 170);
}

/* Vista de categoría "a panel completo" (como en Firefox): al abrir una categoría desaparece todo lo demás
   del panel (título, Apariencia, interruptor de fondos, accesos directos y el enlace de abajo) y solo quedan
   la flecha para volver, el nombre de la categoría y sus imágenes. */
function bgOtherParts(){
  const sec = bgGrid.closest('.cz-section');
  const list = [...bgPanel.querySelectorAll('.cz-head, .cz-foot')];
  bgPanel.querySelectorAll('.cz-scroll > .cz-section').forEach(s => { if(s !== sec) list.push(s); });
  const row = sec && sec.querySelector(':scope > .cz-row');
  if(row) list.push(row);
  list.forEach(el => el.classList.add('cz-hide-in-cat'));
  if(sec) sec.classList.add('cz-cat-sec');
  return list;
}
let bgFades = [];
function clearBgFades(){ bgFades.forEach(a => a.cancel()); bgFades = []; }
function setBgCatView(on){
  clearBgFades();
  bgPanel.classList.toggle('cat-view', on);
  const scroller = bgPanel.querySelector('.cz-scroll');
  if(scroller) scroller.scrollTop = 0;
  if(!on && !reducedMotion())      // al volver, lo demás reaparece con un desvanecido
    bgFades = bgOtherParts().map(el => el.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: 380, easing: SC_EASE_OUT, fill: 'backwards' }));
}

function openBgCategory(id){
  const cat = BG_CATEGORIES.find(c => c.id === id);
  if(!cat || bgBusy) return;
  const parts = bgOtherParts();
  if(!reducedMotion())             // lo demás se desvanece a la vez que las tarjetas
    bgFades = parts.map(el => el.animate([{ opacity: 1 }, { opacity: 0 }],
      { duration: 170, easing: 'ease-in', fill: 'forwards' }));
  swapBgView(bgHome, bgCat, () => { setBgCatView(true); renderBgCategory(cat); }, 1);
}
function closeBgCategory(){
  swapBgView(bgCat, bgHome, () => { setBgCatView(false); renderBgHome(); }, -1);
}

function buildBackgroundPanel(){
  bgGrid.className = 'bgp';
  bgHome = document.createElement('div');
  bgHome.className = 'bgp-grid';
  bgCat = document.createElement('div');
  bgCat.className = 'bgp-cat';
  bgCat.style.display = 'none';
  bgGrid.append(bgHome, bgCat);
  renderBgHome();
}

/* Tu imagen subida: se guarda en IndexedDB (no en localStorage), que sí aguanta archivos enormes.
   Solo se conserva mientras sea tu fondo: al elegir cualquier otro se borra (ver discardCustomBg).
   Acepta hasta 1 GB (PNG, JPG, WebP, GIF, AVIF, SVG...). Las imágenes muy grandes se guardan reducidas a
   4K (3840 px de lado largo) en WebP, que para un fondo se ve igual y carga mucho más rápido. */
function idbOpen(){
  return new Promise((resolve, reject) => {
    if(!window.indexedDB){ reject(new Error('sin IndexedDB')); return; }
    const req = indexedDB.open('startpage', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbRun(mode, fn){
  const db = await idbOpen();
  try{
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('files', mode);
      const req = fn(tx.objectStore('files'));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }finally{ db.close(); }
}
// Sin permiso de cookies (cookies.js) la imagen solo vive en memoria durante la sesión; al aceptar se guarda
const idbMem = new Map();
const idbOk  = () => !window.AKON_CONSENT || AKON_CONSENT.accepted();
const idbGet = key => idbOk() ? idbRun('readonly', st => st.get(key)) : Promise.resolve(idbMem.get(key));
const idbSet = (key, val) => idbOk() ? idbRun('readwrite', st => st.put(val, key)) : (idbMem.set(key, val), Promise.resolve());
const idbDel = key => idbOk() ? idbRun('readwrite', st => st.delete(key)) : (idbMem.delete(key), Promise.resolve());
document.addEventListener('akon-consent', async () => {
  if(!idbOk()){ return; }
  for(const [k, v] of idbMem){ try{ await idbRun('readwrite', st => st.put(v, k)); }catch(e){} }
  idbMem.clear();
});

// Borra tu imagen subida (archivo, dirección temporal y tarjeta "Tu imagen")
function discardCustomBg(){
  if(customUrl){ URL.revokeObjectURL(customUrl); customUrl = null; }
  idbDel('custom_bg').catch(() => {});
  try{ localStorage.removeItem(BG_CUSTOM_KEY); }catch(e){}
  if(!bgHome) return;
  const tile = bgHome.querySelector(`[data-bg="${CUSTOM_BG_ID}"]`);
  if(tile && bgHome.style.display !== 'none' && !reducedMotion()){
    // La tarjeta se encoge y desvanece; después las demás se acomodan
    tile.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.8)' }],
      { duration: 240, easing: 'ease-in', fill: 'forwards' }
    ).onfinish = renderBgHome;
  }else if(bgHome.style.display !== 'none'){
    renderBgHome();
  }
}

// Reduce a 4K (y a WebP) solo si hace falta; GIF y SVG se guardan tal cual
async function prepareBgImage(file){
  if(/gif|svg/i.test(file.type)) return file;
  try{
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, BG_DISPLAY_MAX / Math.max(bmp.width, bmp.height));
    if(scale === 1 && file.size <= 25 * 1024 * 1024){ bmp.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise(res => canvas.toBlob(res, 'image/webp', 0.92));
    return out && out.size ? out : file;
  }catch(e){
    return file;      // si el navegador no la puede reducir, se guarda la original
  }
}

function useCustomBlob(blob){
  if(customUrl) URL.revokeObjectURL(customUrl);
  customUrl = URL.createObjectURL(blob);
}

// Al abrir la página: recupera tu imagen (y pasa a IndexedDB la que se guardó con la versión anterior)
async function loadCustomBg(){
  try{
    let blob = await idbGet('custom_bg');
    let legacy = null;
    try{ legacy = localStorage.getItem(BG_CUSTOM_KEY); }catch(e){}
    const active = isCustomBg(bgCurrent) || (bgCurrent || '').startsWith('data:');
    if(!active){                       // sobró una imagen de antes y ya no es tu fondo: se borra
      if(blob) await idbDel('custom_bg');
      if(legacy){ try{ localStorage.removeItem(BG_CUSTOM_KEY); }catch(e){} }
      return;
    }
    if(!blob && legacy){
      blob = await (await fetch(legacy)).blob();
      await idbSet('custom_bg', blob);
      try{
        localStorage.removeItem(BG_CUSTOM_KEY);
        if((localStorage.getItem(BG_KEY) || '').startsWith('data:')) localStorage.setItem(BG_KEY, CUSTOM_BG_ID);
      }catch(e){}
      if(bgCurrent && bgCurrent.startsWith('data:')) bgCurrent = CUSTOM_BG_ID;
    }
    if(!blob) return;
    useCustomBlob(blob);
    if(bgHome && bgHome.style.display !== 'none') renderBgHome();
    if(isCustomBg(bgCurrent) || (bgCurrent && bgCurrent.startsWith('data:'))) applyBackground(bgCurrent.startsWith('data:') ? CUSTOM_BG_ID : bgCurrent);
  }catch(e){}
}

bgFileInput.addEventListener('change', async () => {
  const file = bgFileInput.files[0];
  bgFileInput.value = '';
  if(!file) return;
  if(!file.type.startsWith('image/')){
    alert('Ese archivo no es una imagen. Usa PNG, JPG, WebP, GIF o similar.');
    return;
  }
  if(file.size > BG_MAX_UPLOAD_MB * 1024 * 1024){
    alert('Esa imagen pesa más de 1 GB. Usa una más ligera.');
    return;
  }
  const label = bgHome.querySelector('.bgp-add .bgp-label');
  const addBtn = bgHome.querySelector('.bgp-add');
  const oldText = label ? label.textContent : '';
  if(label){ label.textContent = 'Procesando…'; addBtn.classList.add('bgp-busy'); addBtn.disabled = true; }

  const blob = await prepareBgImage(file);
  let saved = true;
  try{ await idbSet('custom_bg', blob); }
  catch(e){ saved = false; }

  useCustomBlob(blob);
  if(bgHome.style.display !== 'none') renderBgHome();
  else if(label){ label.textContent = oldText; addBtn.classList.remove('bgp-busy'); addBtn.disabled = false; }

  // Comprueba que el navegador pueda dibujarla antes de ponerla de fondo
  const test = new Image();
  test.onload = () => {
    setBackground(CUSTOM_BG_ID);
    if(!saved) alert('Tu imagen se puso de fondo, pero no cabe en el espacio del navegador y no se recordará al cerrar la página.');
  };
  test.onerror = () => alert('El navegador no pudo abrir esa imagen. Prueba con otra o con otro formato.');
  test.src = customUrl;
});

loadCustomBg();

// Interruptor para apagar/prender los fondos sin olvidar cuál tenías elegido
bgToggle.addEventListener('change', () => {
  try{ localStorage.setItem(BG_ENABLED_KEY, bgToggle.checked ? 'true' : 'false'); }catch(e){}
  let saved = null;
  try{ saved = localStorage.getItem(BG_KEY); }catch(e){}
  bgGrid.classList.toggle('bg-off', !bgToggle.checked);   // las tarjetas se apagan o se encienden con una transición
  applyBackground(saved, bgToggle.checked ? 'enable' : 'disable');
});

/* --- 7.3 Accesos directos (mostrar/ocultar y número de filas) --- */
const SC_ENABLED_KEY = 'startpage_shortcuts_enabled';
const SC_ROWS_KEY    = 'startpage_shortcuts_rows';
const SC_ROW_HEIGHT  = 38;   // alto de cada acceso directo (.shortcut / .sc-add en el CSS)
const SC_ROW_GAP     = 8;    // separación entre filas (gap del CSS)

const scToggleBtn = byId('scToggle');
const scRowsRow    = byId('scRowsRow');
const scRowsSelect = byId('scRows');

// Animaciones del interruptor (Web Animations): al encender, la caja se despliega empujando hacia abajo
// lo que sigue (por ejemplo "Redes sociales") y luego entran los accesos, con "Agregar" al final con un
// pequeño rebote. Al apagar, los accesos se desvanecen y la caja se recoge subiendo todo lo de abajo.
const SC_EASE_OUT = 'cubic-bezier(.22,1,.36,1)';
const SC_EASE_POP = 'cubic-bezier(.34,1.56,.64,1)';
let scAnims = [];
function cancelScAnims(){ scAnims.forEach(a => a.cancel()); scAnims = []; }
function systemReducedMotion(){
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function motionPref(){
  try{ return localStorage.getItem(MOTION_KEY); }catch(e){ return null; }   // 'true' | 'false' | null
}
// Elección del usuario (Ajustes → Apariencia) y, si no ha elegido, la del sistema
function reducedMotion(){
  const p = motionPref();
  return p === 'true' || (p !== 'false' && systemReducedMotion());
}
// Pone o quita la clase del <html> según la preferencia
function applyMotionPref(){
  document.documentElement.classList.toggle('reduce-motion', reducedMotion());
}

function showShortcuts(){
  cancelScAnims();
  scBox.classList.remove('cz-hidden');
  if(reducedMotion()) return;
  const cs = getComputedStyle(scBox);
  const full = { height: scBox.offsetHeight + 'px', marginTop: cs.marginTop, marginBottom: cs.marginBottom };
  const none = { height: '0px', marginTop: '0px', marginBottom: '0px' };
  scAnims.push(scBox.animate([none, full], { duration: 520, easing: SC_EASE_OUT }));

  const tiles = [...scBox.querySelectorAll('.sc-item')];
  tiles.forEach((el, i) => {
    const isAdd = !!el.querySelector('.sc-add');
    scAnims.push(el.animate(
      isAdd
        ? [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 0, transform: 'translateY(12px) scale(.92)' }, { opacity: 1, transform: 'none' }],
      {
        duration: isAdd ? 560 : 420,
        delay: 220 + i * 50 + (isAdd ? 90 : 0),
        easing: isAdd ? SC_EASE_POP : SC_EASE_OUT,
        fill: 'backwards',
      }
    ));
  });
}

function hideShortcuts(){
  cancelScAnims();
  if(reducedMotion() || scBox.classList.contains('cz-hidden')){
    scBox.classList.add('cz-hidden');
    return;
  }
  const cs = getComputedStyle(scBox);
  const full = { height: scBox.offsetHeight + 'px', marginTop: cs.marginTop, marginBottom: cs.marginBottom };
  const none = { height: '0px', marginTop: '0px', marginBottom: '0px' };

  const tiles = [...scBox.querySelectorAll('.sc-item')];
  tiles.forEach((el, i) => {
    scAnims.push(el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px) scale(.92)' }],
      { duration: 200, delay: (tiles.length - 1 - i) * 30, easing: 'ease-in', fill: 'forwards' }
    ));
  });
  const collapse = scBox.animate([full, none], {
    duration: 460,
    delay: 140 + Math.max(0, tiles.length - 1) * 30,
    easing: 'cubic-bezier(.65,0,.35,1)',
    fill: 'forwards',
  });
  collapse.onfinish = () => { scBox.classList.add('cz-hidden'); cancelScAnims(); };
  scAnims.push(collapse);
}

function applyShortcutsPrefs(animate = false){
  const enabled = scToggleBtn.checked;
  const rows    = Number(scRowsSelect.value);
  toggleReveal(scRowsRow, enabled, animate);
  scBox.style.maxHeight = rows >= 99 ? 'none' : `${rows * SC_ROW_HEIGHT + (rows - 1) * SC_ROW_GAP}px`;
  if(!animate){
    cancelScAnims();
    scBox.classList.toggle('cz-hidden', !enabled);
    return;
  }
  enabled ? showShortcuts() : hideShortcuts();
}
scToggleBtn.addEventListener('change', () => {
  try{ localStorage.setItem(SC_ENABLED_KEY, scToggleBtn.checked ? 'true' : 'false'); }catch(e){}
  applyShortcutsPrefs(true);
});
scRowsSelect.addEventListener('change', () => {
  try{ localStorage.setItem(SC_ROWS_KEY, scRowsSelect.value); }catch(e){}
  applyShortcutsPrefs();
});

// Cambiar la preferencia de animaciones en caliente (la lanza el interruptor de Ajustes)
window.addEventListener('akon-motion-change', () => {
  applyMotionPref();
  // Si había un fundido de fondo en curso, se corta para que no siga animándose
  document.body.classList.remove('bg-fading');
  clearTimeout(bgFadeTimer);
  bgStage.querySelectorAll('.bg-layer').forEach(l => l.getAnimations().forEach(a => a.finish()));
});

// Menú desplegable propio para "Número de filas": se abre y cierra con animación en lugar del
// menú nativo del navegador. El <select> original sigue ahí (oculto) y es el que guarda el valor.
function buildRowsDropdown(){
  const dd = document.createElement('div');
  dd.className = 'cz-dd';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cz-select cz-dd-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Número de filas');
  const label = document.createElement('span');
  btn.append(label);
  btn.insertAdjacentHTML('beforeend', '<svg class="cz-dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>');

  const menu = document.createElement('ul');
  menu.className = 'cz-dd-menu';
  menu.setAttribute('role', 'listbox');
  const items = [...scRowsSelect.options].map((opt, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.dataset.value = opt.value;
    li.textContent = opt.textContent;
    li.style.setProperty('--i', i);
    menu.append(li);
    return li;
  });

  let active = 0;
  function sync(){
    const cur = scRowsSelect.selectedOptions[0];
    label.textContent = cur ? cur.textContent : '';
    items.forEach(li => {
      const on = li.dataset.value === scRowsSelect.value;
      li.classList.toggle('selected', on);
      li.setAttribute('aria-selected', String(on));
    });
  }
  function mark(i){
    active = (i + items.length) % items.length;
    items.forEach((li, k) => li.classList.toggle('active', k === active));
  }
  function isOpen(){ return dd.classList.contains('open'); }
  function openMenu(){
    // Si no cabe hacia abajo, se abre hacia arriba
    const r = btn.getBoundingClientRect();
    const need = items.length * 34 + 16;
    dd.classList.toggle('up', window.innerHeight - r.bottom < need && r.top > need);
    mark(Math.max(0, items.findIndex(li => li.classList.contains('selected'))));
    dd.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }
  function closeMenu(){
    dd.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }
  function pick(li){
    if(li.dataset.value !== scRowsSelect.value){
      scRowsSelect.value = li.dataset.value;
      scRowsSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sync();
    closeMenu();
  }

  btn.addEventListener('click', () => { isOpen() ? closeMenu() : openMenu(); });
  menu.addEventListener('click', e => { const li = e.target.closest('li'); if(li) pick(li); });
  menu.addEventListener('mousemove', e => { const li = e.target.closest('li'); if(li) mark(items.indexOf(li)); });
  dd.addEventListener('keydown', e => {
    if(e.key === 'Escape' && isOpen()){ e.preventDefault(); e.stopPropagation(); closeMenu(); btn.focus(); return; }
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault();
      if(!isOpen()) openMenu();
      else mark(active + (e.key === 'ArrowDown' ? 1 : -1));
    }else if((e.key === 'Enter' || e.key === ' ') && isOpen()){
      e.preventDefault();
      pick(items[active]);
    }
  });
  document.addEventListener('click', e => { if(!dd.contains(e.target)) closeMenu(); });
  bgClose.addEventListener('click', closeMenu);

  dd.append(btn, menu);
  scRowsSelect.style.display = 'none';
  scRowsSelect.after(dd);
  sync();
  return sync;
}
const syncRowsDropdown = buildRowsDropdown();

/* ---------- 8. Eventos globales e inicio ---------- */
document.addEventListener('click', e => {
  if(!engineBtn.contains(e.target)) closeEngineMenu();
  if(!form.contains(e.target)) closeHistory();
  if(!bgBtn.contains(e.target) && !bgPanel.contains(e.target)) closeBgPanel();
});

document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){
    closeEngineMenu();
    closeHistory();
    closeBgPanel();
  }
});

updateClock();
setInterval(updateClock, 1000);
buildEngineMenu();
setEngine(DEFAULT_ENGINE);
applyEngineVisibility();

// Tema de color
buildThemeSwatches();
try{ applyTheme(localStorage.getItem(THEME_KEY) || 'default'); }catch(e){ applyTheme('default'); }

// Fondo de pantalla
buildBackgroundPanel();
const bgScanDone = bgScanFolders();   // la pantalla de inicio espera a que termine para contar los fondos
bgToggle.checked = bgEnabled();
bgGrid.classList.toggle('bg-off', !bgToggle.checked);
try{
  const saved = localStorage.getItem(BG_KEY);
  if(saved) applyBackground(saved);
}catch(e){}
// Los ajustes de accesos directos (mostrar/ocultar, número de filas) se inician más abajo,
// en la sección 14, porque dependen de "shortcuts" (scBox), que se declara ahí.

/* ---------- 9. Ocultar la dirección de los enlaces ---------- */
// El navegador muestra la dirección en una etiqueta al pasar el mouse sobre un <a href>.
// Para que no aparezca, el href se guarda en data-href y el enlace se abre con JavaScript.
// En el HTML se siguen agregando enlaces normales con href: esto los convierte solo.
document.querySelectorAll('.grid a[href]').forEach(a => {
  a.dataset.href = a.getAttribute('href');
  a.removeAttribute('href');
  a.setAttribute('role', 'link');
  a.tabIndex = 0;   // sigue funcionando con el teclado (Tab y Enter)
});

function openLink(a){
  if(a && a.dataset.href) safeOpen(a.dataset.href);
}
document.addEventListener('click', e => {
  const a = e.target.closest('.grid a');
  if(a) openLink(a);
});
// Clic con la rueda del mouse
document.addEventListener('auxclick', e => {
  const a = e.button === 1 && e.target.closest('.grid a');
  if(a){ e.preventDefault(); openLink(a); }
});
document.addEventListener('keydown', e => {
  if((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.grid a')){
    e.preventDefault();   // evita que la barra espaciadora haga scroll
    openLink(e.target);
  }
});

/* ---------- 10. Animación al hacer scroll ---------- */
// Los títulos, las tarjetas y el pie aparecen con una animación al entrar en pantalla.
// Al bajar entran desde abajo; al subir, desde arriba. Cada vez que vuelven a entrar, se repite.
// Las tarjetas se escalonan de izquierda a derecha. Usa la API de animaciones del navegador,
// así no interfiere con los efectos de hover de las tarjetas.
//
// Para saber si algo está en pantalla se usa su posición de diseño (offsetTop), que NO cambia
// mientras se anima. Con IntersectionObserver la propia animación movía el elemento,
// cambiaba su visibilidad y la volvía a disparar en bucle.
(() => {
  if(!Element.prototype.animate) return;

  const ENTER_BOTTOM = 40;    // px: entra por abajo cuando ya se ven 40px del elemento
  const ENTER_TOP    = 24;    // px: entra por arriba cuando ya se ven 24px
  const DURATION     = 700;   // ms
  const STAGGER      = 60;    // ms de retraso entre tarjetas de la misma fila
  const EASING       = 'cubic-bezier(.22,1,.36,1)';

  const targets = [...document.querySelectorAll('section h2, .grid a, footer')];
  const inView  = new Map();      // elemento -> true mientras ya se mostró y sigue en pantalla
  const running = new WeakMap();  // animación en curso de cada elemento
  let lastY = scrollY;            // para saber si se está bajando o subiendo

  const isTile = el => el.matches('.grid a');

  // Posición del elemento respecto a la ventana, sin contar animaciones
  function place(el){
    let top = 0;
    for(let n = el; n; n = n.offsetParent) top += n.offsetTop;
    top -= scrollY;
    return { top, bottom: top + el.offsetHeight };
  }

  // Posición de la tarjeta dentro de su fila (0, 1, 2...) para escalonarlas
  function column(el){
    let n = 0;
    for(let s = el.previousElementSibling; s && s.offsetTop === el.offsetTop; s = s.previousElementSibling) n++;
    return n;
  }

  function reveal(el, fromBelow, extraDelay = 0){
    if(reducedMotion()) return;   // se consulta cada vez: el interruptor funciona sin recargar
    running.get(el)?.cancel();
    const dist = isTile(el) ? 28 : 16;
    const dy   = (fromBelow ? 1 : -1) * dist;
    running.set(el, el.animate(
      [
        { opacity: 0, transform: `translateY(${dy}px) scale(.96)` },
        { opacity: 1, transform: 'none' }
      ],
      { duration: DURATION, delay: extraDelay + (isTile(el) ? column(el) * STAGGER : 0), easing: EASING, fill: 'backwards' }
    ));
  }

  function update(initial){
    const vh = innerHeight;
    const goingDown = scrollY >= lastY;   // false = se está subiendo
    lastY = scrollY;
    let order = 0;
    for(const el of targets){
      const { top, bottom } = place(el);

      if(initial){   // al abrir la página: lo que ya se ve aparece escalonado
        const visible = top < vh && bottom > 0;
        inView.set(el, visible);
        if(visible) reveal(el, true, Math.min(order++ * 45, 700));
        continue;
      }

      const entered = top < vh - ENTER_BOTTOM && bottom > ENTER_TOP;
      const gone    = top >= vh || bottom <= 0;           // fuera por completo: queda listo para repetirse
      if(!inView.get(el) && entered){
        inView.set(el, true);
        reveal(el, goingDown);                             // bajando: entra desde abajo; subiendo: desde arriba
      }else if(inView.get(el) && gone){
        inView.set(el, false);
      }
    }
  }

  let queued = false;
  const schedule = () => {
    if(queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; update(false); });
  };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);

  update(true);
})();

/* ---------- 11. Destello de las tarjetas que sigue al mouse ---------- */
// Guarda dónde está el cursor dentro de la tarjeta; el CSS dibuja ahí la luz (--mx y --my).
document.addEventListener('pointermove', e => {
  if(e.pointerType === 'touch') return;
  const a = e.target.closest && e.target.closest('.grid a');
  if(!a) return;
  const r = a.getBoundingClientRect();
  a.style.setProperty('--mx', `${e.clientX - r.left}px`);
  a.style.setProperty('--my', `${e.clientY - r.top}px`);
});

/* ---------- 12. Bloquear clic derecho ---------- */
document.addEventListener('contextmenu', e => e.preventDefault());


/* ---------- 13. Clima ---------- */
// Usa Open-Meteo (gratis, sin clave). Por defecto muestra WEATHER_PLACE; al hacer clic en el clima
// se pide tu ubicación al navegador y se recuerda (otro clic vuelve al lugar por defecto).
// La ubicación se guarda solo en este navegador y con coordenadas redondeadas (~1 km).
const WEATHER_PLACE      = { name: 'Ciudad de México', lat: 19.43, lon: -99.13 };
const WEATHER_REFRESH_MS = 10 * 60 * 1000;   // se actualiza cada 10 minutos

// Estados de México: [id, nombre, latitud, longitud]. Se usa el clima de la ciudad capital de cada estado.
const MX_STATES = [
  ['ciudad-de-mexico', 'Ciudad de México', 19.43, -99.13],
  ['aguascalientes', 'Aguascalientes', 21.88, -102.29],
  ['baja-california', 'Baja California', 32.66, -115.47],
  ['baja-california-sur', 'Baja California Sur', 24.14, -110.31],
  ['campeche', 'Campeche', 19.85, -90.53],
  ['chiapas', 'Chiapas', 16.75, -93.12],
  ['chihuahua', 'Chihuahua', 28.63, -106.07],
  ['coahuila', 'Coahuila', 25.42, -101.00],
  ['colima', 'Colima', 19.24, -103.72],
  ['durango', 'Durango', 24.02, -104.66],
  ['guanajuato', 'Guanajuato', 21.02, -101.26],
  ['guerrero', 'Guerrero', 17.55, -99.50],
  ['hidalgo', 'Hidalgo', 20.12, -98.73],
  ['jalisco', 'Jalisco', 20.67, -103.35],
  ['mexico', 'Estado de México', 19.29, -99.66],
  ['michoacan', 'Michoacán', 19.71, -101.19],
  ['morelos', 'Morelos', 18.92, -99.23],
  ['nayarit', 'Nayarit', 21.51, -104.89],
  ['nuevo-leon', 'Nuevo León', 25.67, -100.31],
  ['oaxaca', 'Oaxaca', 17.07, -96.73],
  ['puebla', 'Puebla', 19.04, -98.21],
  ['queretaro', 'Querétaro', 20.59, -100.39],
  ['quintana-roo', 'Quintana Roo', 18.50, -88.30],
  ['san-luis-potosi', 'San Luis Potosí', 22.15, -100.98],
  ['sinaloa', 'Sinaloa', 24.81, -107.39],
  ['sonora', 'Sonora', 29.07, -110.96],
  ['tabasco', 'Tabasco', 17.99, -92.93],
  ['tamaulipas', 'Tamaulipas', 23.74, -99.15],
  ['tlaxcala', 'Tlaxcala', 19.32, -98.24],
  ['veracruz', 'Veracruz', 19.54, -96.91],
  ['yucatan', 'Yucatán', 20.97, -89.62],
  ['zacatecas', 'Zacatecas', 22.77, -102.57]
];

const WEATHER_PLACE_KEY  = 'startpage_weather_place';
const WEATHER_CACHE_KEY  = 'startpage_weather_cache';

// Código WMO -> [descripción, icono de día, icono de noche (opcional)]
const WEATHER_CODES = {
  0:  ['Despejado', '☀️', '🌙'],
  1:  ['Mayormente despejado', '🌤️', '🌙'],
  2:  ['Parcialmente nublado', '⛅', '☁️'],
  3:  ['Nublado', '☁️'],
  45: ['Niebla', '🌫️'],            48: ['Niebla con escarcha', '🌫️'],
  51: ['Llovizna ligera', '🌦️'],   53: ['Llovizna', '🌦️'],          55: ['Llovizna fuerte', '🌧️'],
  56: ['Llovizna helada', '🌧️'],   57: ['Llovizna helada fuerte', '🌧️'],
  61: ['Lluvia ligera', '🌧️'],     63: ['Lluvia', '🌧️'],            65: ['Lluvia fuerte', '🌧️'],
  66: ['Lluvia helada', '🌧️'],     67: ['Lluvia helada fuerte', '🌧️'],
  71: ['Nevada ligera', '🌨️'],     73: ['Nevada', '🌨️'],            75: ['Nevada fuerte', '❄️'],
  77: ['Granizo fino', '🌨️'],
  80: ['Chubascos ligeros', '🌦️'], 81: ['Chubascos', '🌧️'],         82: ['Chubascos fuertes', '🌧️'],
  85: ['Chubascos de nieve', '🌨️'], 86: ['Chubascos de nieve fuertes', '🌨️'],
  95: ['Tormenta', '⛈️'],          96: ['Tormenta con granizo', '⛈️'], 99: ['Tormenta con granizo fuerte', '⛈️']
};

const weatherEl = byId('weather');
const wIcon     = byId('wIcon');
const wTemp     = byId('wTemp');
const wDesc     = byId('wDesc');
const wPlace    = byId('wPlace');
const wDetail   = byId('wDetail');

let weatherPlace = WEATHER_PLACE;
let weatherData  = null;     // última lectura mostrada
let weatherAt    = 0;        // cuándo se obtuvo (ms)
let weatherAbort = null;

try{
  const saved = JSON.parse(localStorage.getItem(WEATHER_PLACE_KEY) || 'null');
  if(saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon) && Math.abs(saved.lat) <= 90 && Math.abs(saved.lon) <= 180){
    weatherPlace = { name: typeof saved.name === 'string' ? cleanText(saved.name, 40) : 'Mi ubicación', lat: saved.lat, lon: saved.lon };
  if(saved && saved.geo === true) weatherPlace.geo = true;
  const known = saved && MX_STATES.find(st => st[0] === saved.state);
  if(known){ weatherPlace.state = known[0]; weatherPlace.name = known[1]; }     // el nombre siempre sale de la lista actual
  }
}catch(e){}

const samePlace = (a, b) => a && b && a.lat === b.lat && a.lon === b.lon;

function renderWeather(data, place){
  const [desc, dayIcon, nightIcon] = WEATHER_CODES[data.code] || ['Clima', '🌡️'];
  wIcon.textContent   = (!data.isDay && nightIcon) ? nightIcon : dayIcon;
  wTemp.textContent   = `${Math.round(data.temp)}°`;
  wDesc.textContent   = desc;
  wPlace.textContent  = `${place.name} · Máx ${Math.round(data.max)}° · Mín ${Math.round(data.min)}°`;
  wDetail.textContent = `Sensación ${Math.round(data.feels)}° · Humedad ${Math.round(data.humidity)}% · Viento ${Math.round(data.wind)} km/h`;
  weatherEl.classList.add('ready');
}

async function loadWeather(){
  weatherAbort?.abort();
  const ctrl  = new AbortController();
  weatherAbort = ctrl;
  const place = weatherPlace;

  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${place.lat}&longitude=${place.lon}`
    + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day'
    + '&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto';

  try{
    const res = await fetch(url, { signal: ctrl.signal });
    if(!res.ok) throw new Error('Clima: ' + res.status);
    const json = await res.json();
    const c = json.current, d = json.daily;
    if(!c || !d) throw new Error('Clima: respuesta inesperada');

    weatherData = {
      temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m,
      wind: c.wind_speed_10m, code: c.weather_code, isDay: c.is_day === 1,
      max: d.temperature_2m_max[0], min: d.temperature_2m_min[0]
    };
    weatherAt = Date.now();
    renderWeather(weatherData, place);
    try{ localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ place, at: weatherAt, data: weatherData })); }catch(e){}
  }catch(e){
    if(ctrl.signal.aborted) return;
    // Sin internet: se queda la última lectura; si no hay ninguna, se avisa
    if(!weatherData){
      weatherEl.classList.add('ready');
      wIcon.textContent = '🌡️';
      wTemp.textContent = '--°';
      wDesc.textContent = 'Clima no disponible';
      wPlace.textContent = place.name;
      wDetail.textContent = '';
    }
  }
}

// Pide tu ubicación al navegador y muestra el clima de ahí
function useMyLocation(){
  if(!navigator.geolocation) return;
  const previous = wDesc.textContent;
  wDesc.textContent = 'Buscando tu ubicación…';
  navigator.geolocation.getCurrentPosition(pos => {
    weatherPlace = {
      name: 'Mi ubicación', geo: true,
      lat: Number(pos.coords.latitude.toFixed(2)),
      lon: Number(pos.coords.longitude.toFixed(2))
    };
    try{ localStorage.setItem(WEATHER_PLACE_KEY, JSON.stringify(weatherPlace)); }catch(e){}
    weatherData = null;
    loadWeather();
  }, () => {
    wDesc.textContent = 'No se pudo obtener tu ubicación';
    setTimeout(() => { wDesc.textContent = previous; }, 2500);
  }, { timeout: 8000, maximumAge: 10 * 60 * 1000 });
}

// Elige el clima de un estado (id de MX_STATES); Ciudad de México es el lugar por defecto
function weatherPickState(id){
  const st = MX_STATES.find(x => x[0] === id);
  if(!st) return;
  if(samePlace({ lat: st[2], lon: st[3] }, WEATHER_PLACE)){
    weatherPlace = WEATHER_PLACE;
    try{ localStorage.removeItem(WEATHER_PLACE_KEY); }catch(e){}
  }else{
    weatherPlace = { name: st[1], lat: st[2], lon: st[3], state: st[0] };
    try{ localStorage.setItem(WEATHER_PLACE_KEY, JSON.stringify(weatherPlace)); }catch(e){}
  }
  weatherData = null;
  loadWeather();
}
// Qué opción del selector de Ajustes corresponde al lugar actual
function weatherCurrentChoice(){
  if(weatherPlace.geo) return 'geo';
  if(weatherPlace.state) return weatherPlace.state;
  return samePlace(weatherPlace, WEATHER_PLACE) ? 'ciudad-de-mexico' : 'geo';
}

// Clic en el clima: alterna entre el lugar por defecto y tu ubicación
weatherEl.addEventListener('click', () => {
  if(weatherPlace.geo || weatherPlace.state){
    weatherPlace = WEATHER_PLACE;
    try{ localStorage.removeItem(WEATHER_PLACE_KEY); }catch(e){}
    weatherData = null;
    loadWeather();
    return;
  }
  useMyLocation();
});

// Al abrir la página: primero lo último que se guardó (aparece al instante) y luego se actualiza
try{
  const cache = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null');
  if(cache && cache.data && samePlace(cache.place, weatherPlace)){
    weatherData = cache.data;
    weatherAt   = cache.at || 0;
    renderWeather(weatherData, weatherPlace);
  }
}catch(e){}
loadWeather();
setInterval(loadWeather, WEATHER_REFRESH_MS);

// Al volver a la pestaña o recuperar internet, se actualiza si la lectura ya está vieja
const refreshIfStale = () => { if(Date.now() - weatherAt > 5 * 60 * 1000) loadWeather(); };
document.addEventListener('visibilitychange', () => { if(!document.hidden) refreshIfStale(); });
addEventListener('online', loadWeather);


/* ---------- 14. Accesos directos ---------- */
// Debajo de la barra de búsqueda: el botón "+" abre un cuadro donde pones la dirección (y, si
// quieres, el nombre). Se guardan en este navegador (localStorage) y el icono se pide solo.
// Pasa el mouse sobre uno para ver la "×" que lo quita.
const SHORTCUTS_KEY = 'startpage_shortcuts';
const SHORTCUTS_MAX = 16;

const scBox    = byId('shortcuts');
const scDialog = byId('scDialog');
const scForm   = byId('scForm');
const scUrl    = byId('scUrl');
const scName   = byId('scName');
const scError  = byId('scError');

const PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

// "youtube.com" -> "https://youtube.com/". Solo se aceptan direcciones http(s).
function normalizeUrl(raw){
  let text = raw.trim();
  if(!text) return null;
  if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = 'https://' + text;
  try{
    const u = new URL(text);
    if(u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if(!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  }catch(e){
    return null;
  }
}

// Si no escribes nombre: "https://www.github.com/..." -> "Github"
function defaultName(url){
  const label = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function loadShortcuts(){
  try{
    const items = JSON.parse(localStorage.getItem(SHORTCUTS_KEY) || '[]');
    if(!Array.isArray(items)) return [];
    return items
      .map(i => ({ url: i && typeof i.url === 'string' ? normalizeUrl(i.url) : null, name: i && i.name }))
      .filter(i => i.url)
      .map(i => ({ url: i.url, name: typeof i.name === 'string' && cleanText(i.name, 24) ? cleanText(i.name, 24) : defaultName(i.url) }))
      .slice(0, SHORTCUTS_MAX);
  }catch(e){
    return [];
  }
}

function saveShortcuts(items){
  try{ localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(items)); }catch(e){}
}

function buildShortcut(item, i, delay){
  const wrap = document.createElement('div');
  wrap.className = 'sc-item';
  if(delay !== null){
    wrap.classList.add('enter');
    wrap.style.setProperty('--i', delay);
  }

  const link = document.createElement('a');
  link.className = 'shortcut';
  link.dataset.href = item.url;      // como las demás tarjetas: la dirección no se muestra al pasar el mouse
  link.setAttribute('role', 'link');
  link.tabIndex = 0;

  // La inicial se ve mientras el icono carga (o si no carga)
  const icon = document.createElement('span');
  icon.className = 'sc-icon';
  const letter = document.createElement('span');
  letter.className = 'sc-letter';
  letter.textContent = item.name.charAt(0).toUpperCase();

  const img = new Image();
  img.alt = '';
  img.src = 'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(new URL(item.url).hostname);
  img.addEventListener('load', () => icon.classList.add('loaded'));
  icon.append(letter, img);

  const name = document.createElement('span');
  name.className = 'sc-name';
  name.textContent = item.name;
  link.append(icon, name);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'sc-remove';
  remove.dataset.i = i;
  remove.setAttribute('aria-label', 'Quitar ' + item.name);
  remove.textContent = '×';

  wrap.append(link, remove);
  return wrap;
}

function buildAddTile(delay){
  const wrap = document.createElement('div');
  wrap.className = 'sc-item';
  if(delay !== null){
    wrap.classList.add('enter');
    wrap.style.setProperty('--i', delay);
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sc-add';
  btn.setAttribute('aria-label', 'Agregar acceso directo');
  btn.innerHTML = '<span class="sc-icon">' + PLUS_SVG + '</span><span class="sc-name">Agregar</span>';
  wrap.append(btn);
  return wrap;
}

// enterFrom: desde qué posición se anima la entrada (0 = todos, Infinity = ninguno)
function renderShortcuts(enterFrom = Infinity){
  const items = loadShortcuts();
  scBox.textContent = '';
  items.forEach((item, i) => scBox.append(buildShortcut(item, i, i >= enterFrom ? i - enterFrom : null)));
  if(items.length < SHORTCUTS_MAX){
    scBox.append(buildAddTile(items.length >= enterFrom ? items.length - enterFrom : null));
  }
}

function openScDialog(){
  scForm.reset();
  scError.textContent = '';
  scDialog.showModal();
  scUrl.focus();
}

scBox.addEventListener('click', e => {
  const remove = e.target.closest('.sc-remove');
  if(remove){
    const wrap = remove.closest('.sc-item');
    if(wrap.dataset.removing) return;
    wrap.dataset.removing = '1';
    const finish = () => {
      const items = loadShortcuts();
      items.splice(Number(remove.dataset.i), 1);
      saveShortcuts(items);
      renderShortcuts();
    };
    if(reducedMotion()){ finish(); return; }
    // El acceso se encoge y desvanece; mientras su ancho baja a 0, los demás se recorren hacia su lugar
    wrap.style.overflow = 'hidden';
    wrap.style.pointerEvents = 'none';
    const w = wrap.getBoundingClientRect().width;
    wrap.animate(
      [
        { width: w + 'px', marginRight: '0px', opacity: 1, transform: 'none' },
        { width: '0px', marginRight: '-8px', opacity: 0, transform: 'scale(.8)' },
      ],
      { duration: 340, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }
    ).onfinish = finish;
    return;
  }
  if(e.target.closest('.sc-add')){ openScDialog(); return; }
  const link = e.target.closest('.shortcut');
  if(link) openLink(link);
});
scBox.addEventListener('auxclick', e => {          // clic con la rueda del mouse
  const link = e.button === 1 && e.target.closest('.shortcut');
  if(link){ e.preventDefault(); openLink(link); }
});
scBox.addEventListener('keydown', e => {
  if((e.key === 'Enter' || e.key === ' ') && e.target.matches('.shortcut')){
    e.preventDefault();
    openLink(e.target);
  }
});

scForm.addEventListener('submit', e => {
  e.preventDefault();
  const url = normalizeUrl(scUrl.value);
  if(!url){
    scError.textContent = 'Escribe una dirección válida, por ejemplo youtube.com';
    scUrl.focus();
    return;
  }
  const items = loadShortcuts();
  if(items.some(i => i.url === url)){
    scError.textContent = 'Ese acceso directo ya está agregado';
    return;
  }
  items.push({ url, name: scName.value.trim().slice(0, 24) || defaultName(url) });
  saveShortcuts(items);
  scDialog.close();
  renderShortcuts(items.length - 1);   // solo el nuevo entra con animación
});
byId('scCancel').addEventListener('click', () => scDialog.close());
scDialog.addEventListener('click', e => { if(e.target === scDialog) scDialog.close(); });   // clic fuera del cuadro

renderShortcuts(0);

// Ajustes de accesos directos (ver sección 7.3): mostrar/ocultar y número de filas
try{ scToggleBtn.checked = localStorage.getItem(SC_ENABLED_KEY) !== 'false'; }catch(e){}
try{ scRowsSelect.value = localStorage.getItem(SC_ROWS_KEY) || '1'; }catch(e){}
syncRowsDropdown();
applyShortcutsPrefs();
applyMotionPref();


/* ---------- 15. Buscador rápido (Ctrl + V) ---------- */
// Ctrl + V (o ⌘ + V) desenfoca toda la página y muestra solo una barra de búsqueda en el centro.
// Al escribir aparecen, en este orden: tus enlaces y accesos directos que coinciden, la búsqueda
// en el buscador actual y las sugerencias. Con la barra vacía se ven tus búsquedas recientes.
//   ↑ ↓  mover      Enter  abrir lo marcado      Shift + Enter  buscar en la web      Esc  cerrar
const qsEl    = byId('qs');
const qsInput = byId('qsInput');
const qsList  = byId('qsList');

let qsItems     = [];     // filas que se están mostrando
let qsActive    = 0;      // fila marcada
let qsSuggest   = [];     // sugerencias de internet
let qsTimer     = null;
let qsAbort     = null;
let qsPrevFocus = null;

const qsFold = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');   // sin mayúsculas ni acentos

// Enlaces de las tarjetas + accesos directos, con el icono que ya usan
function qsCollectLinks(){
  const links = [];
  document.querySelectorAll('.grid a').forEach(a => {
    const url = a.dataset.href || a.getAttribute('href');
    if(!url) return;
    const img = a.querySelector('img');
    links.push({
      name:  a.textContent.trim(),
      url,
      icon:  img ? img.getAttribute('src') : null,
      group: a.closest('section')?.querySelector('h2')?.textContent.trim() || ''
    });
  });
  for(const s of loadShortcuts()){
    links.push({
      name: s.name,
      url:  s.url,
      icon: 'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(new URL(s.url).hostname),
      group: 'Accesos directos'
    });
  }
  return links;
}

function qsMatches(term){
  const t = qsFold(term);
  const score = l => {
    const name = qsFold(l.name);
    if(name.startsWith(t)) return 3;
    if(name.includes(' ' + t)) return 2;
    if(name.includes(t)) return 1;
    return qsFold(new URL(l.url).hostname).includes(t) ? 1 : 0;
  };
  return qsCollectLinks()
    .map(l => ({ ...l, score: score(l) }))
    .filter(l => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function qsSetActive(i){
  qsActive = i;
  qsList.querySelectorAll('.qs-item').forEach((btn, n) => {
    btn.classList.toggle('active', n === i);
    btn.setAttribute('aria-selected', n === i);
    if(n === i) btn.scrollIntoView({ block: 'nearest' });
  });
}

function qsRender(keepActive = false){
  const term = qsInput.value.trim();
  const items = [];

  if(term){
    for(const l of qsMatches(term)) items.push({ type: 'link', ...l });
    items.push({ type: 'search', q: term, engine: currentEngine, main: true });
    const seen = new Set([term.toLowerCase()]);
    for(const s of qsSuggest){
      if(seen.has(s.toLowerCase())) continue;
      seen.add(s.toLowerCase());
      items.push({ type: 'search', q: s, engine: currentEngine });
    }
  }else{
    for(const h of loadHistory()) items.push({ type: 'recent', q: h.q, engine: h.engine });
  }

  qsItems  = items;
  qsActive = keepActive && qsActive < items.length ? qsActive : 0;
  qsList.textContent = '';

  if(!items.length){
    const li = document.createElement('li');
    li.className = 'qs-empty';
    li.textContent = 'Escribe para buscar en tus enlaces o en la web';
    qsList.append(li);
    return;
  }

  items.forEach((it, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qs-item';
    btn.setAttribute('role', 'option');
    btn.dataset.i = i;

    const ico = document.createElement('span');
    ico.className = 'qs-ico';
    if(it.type === 'link' && it.icon){
      const img = new Image();
      img.alt = '';
      img.src = it.icon;
      ico.append(img);
    }else{
      ico.innerHTML = it.type === 'recent' ? CLOCK_SVG : SEARCH_SVG;   // contenido fijo
    }

    const label = document.createElement('span');
    label.className = 'qs-label';
    const meta = document.createElement('span');
    meta.className = 'qs-meta';

    if(it.type === 'link'){
      label.textContent = it.name;
      meta.textContent  = it.group;
    }else if(it.main){
      label.textContent = `Buscar “${it.q}”`;
      meta.textContent  = ENGINES[it.engine].name;
    }else{
      label.textContent = it.q;
      meta.textContent  = it.type === 'recent' ? ENGINES[it.engine].name : '';
    }

    btn.append(ico, label, meta);
    const li = document.createElement('li');
    li.append(btn);
    qsList.append(li);
  });
  qsSetActive(qsActive);
}

function qsActivate(it){
  if(!it) return;
  closeQs();
  if(it.type === 'link') safeOpen(it.url);
  else runSearch(it.q, it.engine);
}

// Sugerencias de internet (las mismas fuentes del autocompletado de la barra principal)
function qsScheduleSuggestions(){
  clearTimeout(qsTimer);
  qsAbort?.abort();
  const q = qsInput.value.trim();
  const sourceKey = ENGINES[currentEngine].suggest;
  if(!AUTOCOMPLETE || !q || !sourceKey){ qsSuggest = []; return; }

  qsTimer = setTimeout(async () => {
    const ctrl = new AbortController();
    qsAbort = ctrl;
    try{
      const list = await fetchSuggestions(q, sourceKey, ctrl.signal);
      if(ctrl.signal.aborted) return;
      qsSuggest = list;
      qsRender(true);
    }catch(e){}
  }, SUGGEST_DELAY);
}

// Mientras está abierto, el resto de la página no recibe foco ni teclas
const qsBackground = () => [document.querySelector('main'), bgBtn, bgPanel];

function openQs(){
  closeEngineMenu();
  closeHistory();
  closeBgPanel();
  qsPrevFocus = document.activeElement;
  qsBackground().forEach(el => { el.inert = true; });
  document.body.classList.add('qs-open');
  qsEl.classList.add('open');
  qsEl.setAttribute('aria-hidden', 'false');
  qsInput.value = '';
  qsSuggest = [];
  qsRender();
  qsInput.focus();
}

function closeQs(){
  if(!qsEl.classList.contains('open')) return;
  clearTimeout(qsTimer);
  qsAbort?.abort();
  qsEl.classList.remove('open');
  qsEl.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('qs-open');
  qsBackground().forEach(el => { el.inert = false; });
  qsInput.blur();
  qsPrevFocus?.focus?.();
}

// ¿Está abierta la pantalla de Ajustes? (el buscador rápido solo funciona en la página principal)
const settingsIsOpen = () => !!document.getElementById('settings')?.classList.contains('open');

// Aviso que aparece arriba, unos segundos (lo usan Ctrl + V dentro de Ajustes y la barra "Buscar en ajustes")
let settingsWarnEl = null, settingsWarnTimer = 0;
function showSettingsWarning(msg = 'El buscador rápido (Ctrl + V) solo funciona en la página principal.'){
  if(!settingsWarnEl){
    settingsWarnEl = document.createElement('div');
    settingsWarnEl.className = 'warn-toast';
    settingsWarnEl.setAttribute('role', 'status');
    settingsWarnEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><span></span>';
    document.body.append(settingsWarnEl);
  }
  settingsWarnEl.lastElementChild.textContent = msg;
  settingsWarnEl.classList.remove('show');
  void settingsWarnEl.offsetWidth;                 // reinicia la animación si se pulsa varias veces seguidas
  settingsWarnEl.classList.add('show');
  clearTimeout(settingsWarnTimer);
  settingsWarnTimer = setTimeout(() => settingsWarnEl.classList.remove('show'), 3200);
}

/* ---------- Barra de búsqueda: sin foco por defecto, y se "suelta" sola tras 5 s sin usarla ----------
   Mientras la barra está activa, Ctrl + V pega texto en ella y NO abre el buscador rápido.
   Cuando pasan 5 s sin escribir, hacer clic ni moverse por su lista, deja de estar seleccionada
   y Ctrl + V vuelve a abrir el buscador rápido. */
const SEARCH_IDLE_MS = 5000;
let searchIdleTimer = 0;
function searchBarTouch(){
  clearTimeout(searchIdleTimer);
  if(document.activeElement !== input) return;
  searchIdleTimer = setTimeout(searchBarRelease, SEARCH_IDLE_MS);
}
function searchBarRelease(){
  if(document.activeElement !== input) return;
  if(engineMenu.classList.contains('open')) return searchBarTouch();   // con el menú de buscadores abierto sigue en uso
  closeHistory();
  input.blur();
}
['focus', 'input', 'keydown', 'click'].forEach(ev => input.addEventListener(ev, searchBarTouch));
input.addEventListener('blur', () => clearTimeout(searchIdleTimer));
['pointermove', 'pointerdown', 'wheel'].forEach(ev => historyMenu.addEventListener(ev, searchBarTouch, { passive: true }));

// ¿El cursor está escribiendo en un campo de texto? (ahí Ctrl + V debe pegar, como siempre)
const isTypingTarget = t => !!(t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));

document.addEventListener('keydown', e => {
  if((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'v'){
    if(isTypingTarget(e.target)) return;   // barra de búsqueda (u otro campo) activa: se pega normal y NO se abre el buscador rápido
    e.preventDefault();                    // sin ningún campo activo: no se pega nada
    if(settingsIsOpen()){ showSettingsWarning(); return; }   // en Ajustes no abre nada: solo avisa
    qsEl.classList.contains('open') ? closeQs() : openQs();
  }else if(e.key === 'Escape'){
    closeQs();
  }
});

qsInput.addEventListener('input', () => {
  qsRender();
  qsScheduleSuggestions();
});

qsInput.addEventListener('keydown', e => {
  if(e.isComposing) return;
  const n = qsItems.length;
  if(e.key === 'ArrowDown'){
    e.preventDefault();
    if(n) qsSetActive((qsActive + 1) % n);
  }else if(e.key === 'ArrowUp'){
    e.preventDefault();
    if(n) qsSetActive((qsActive - 1 + n) % n);
  }else if(e.key === 'Enter'){
    e.preventDefault();
    const term = qsInput.value.trim();
    if(e.shiftKey && term) qsActivate({ type: 'search', q: term, engine: currentEngine });
    else qsActivate(qsItems[qsActive]);
  }else if(e.key === 'Tab'){
    e.preventDefault();   // el foco se queda en la barra
  }
});

qsList.addEventListener('mousemove', e => {
  const btn = e.target.closest('.qs-item');
  if(btn && Number(btn.dataset.i) !== qsActive) qsSetActive(Number(btn.dataset.i));
});
qsList.addEventListener('click', e => {
  const btn = e.target.closest('.qs-item');
  if(btn) qsActivate(qsItems[Number(btn.dataset.i)]);
});
qsEl.addEventListener('mousedown', e => { if(e.target === qsEl) closeQs(); });   // clic fuera de la barra


/* ---------- Dispositivo: ¿computadora o móvil? ----------
   La pantalla de inicio lo comprueba y deja el resultado en <html data-device="pc|mobile"> (por si el CSS lo quiere usar).
   Se puede detectar de dos maneras, y en Ajustes → Apariencia → Dispositivo se elige cuál (o se corrige a mano):
     - User-Agent: lo que el navegador dice de sí mismo (Android, iPhone, "Mobile"...). Los iPad con "sitio de escritorio" se reconocen por el tacto.
     - Tamaño de pantalla: el lado corto de la pantalla del aparato mide DEVICE_MAX_SHORT píxeles o menos.
   "Automático" usa las dos: si cualquiera dice móvil, es móvil. */
const DEVICE_KEY       = 'startpage_device_mode';   // 'auto' | 'ua' | 'screen' | 'pc' | 'mobile'
const DEVICE_MAX_SHORT = 500;                       // px (CSS) del lado corto de la pantalla: menos o igual = móvil
const DEVICE_MODES = [
  ['auto',   'Automático (User-Agent y pantalla)'],
  ['ua',     'Solo User-Agent'],
  ['screen', 'Solo tamaño de pantalla'],
  ['pc',     'Siempre computadora'],
  ['mobile', 'Siempre móvil']
];
function deviceMode(){
  try{ const v = localStorage.getItem(DEVICE_KEY); return DEVICE_MODES.some(m => m[0] === v) ? v : 'auto'; }
  catch(e){ return 'auto'; }
}
function deviceByUA(){
  const uad = navigator.userAgentData;
  if(uad && uad.mobile === true) return true;                      // Chrome/Edge lo dicen directamente
  const ua = navigator.userAgent || '';
  if(/Android|iPhone|iPad|iPod|Mobile|Windows Phone|IEMobile|BlackBerry|Opera Mini|webOS/i.test(ua)) return true;
  if(/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;   // iPad que se presenta como Mac
  return false;
}
function deviceByScreen(){
  const w = screen.width || window.innerWidth, h = screen.height || window.innerHeight;
  return Math.min(w, h) <= DEVICE_MAX_SHORT;
}
function detectDevice(){
  const mode = deviceMode();
  const ua = deviceByUA(), sc = deviceByScreen();
  if(mode === 'ua')     return { mode, mobile: ua, how: 'User-Agent' };
  if(mode === 'screen') return { mode, mobile: sc, how: 'tamaño de pantalla' };
  if(mode === 'pc')     return { mode, mobile: false, how: 'elegido por ti' };
  if(mode === 'mobile') return { mode, mobile: true,  how: 'elegido por ti' };
  const how = ua && sc ? 'User-Agent y pantalla' : ua ? 'User-Agent' : sc ? 'tamaño de pantalla' : 'User-Agent y pantalla';
  return { mode, mobile: ua || sc, how };
}
let currentDevice = null;
function applyDevice(){
  currentDevice = detectDevice();
  document.documentElement.dataset.device = currentDevice.mobile ? 'mobile' : 'pc';
  return currentDevice;
}
const deviceName = d => d.mobile ? 'Móvil' : 'Computadora';

applyDevice();      // ya desde el principio, aunque se salte la pantalla de inicio (Ctrl + R)

/* ---------- 16. Pantalla de inicio ---------- */
// Al abrir la página se ve el logo (el águila) en el centro con un anillo y una lista de pasos:
// HTML, CSS, JavaScript e Imágenes. Cada paso se toma su tiempo y se verifica de verdad.
// Si falta algo (una parte del HTML, la hoja de estilos o alguna imagen) la página NO inicia:
// se muestra la pantalla 404 (el cavernícola) con lo que falta. Si todo está bien, el águila
// vuela hasta el logo de la esquina superior izquierda y el resto de la página aparece.
// Si falta style_pc.css lo detecta este mismo código (404). Si falta script_pc.js, la pantalla 404 sale sola a los 8 s (solo con CSS).
// Sin internet se muestra la pantalla 106.
// INTRO_ENABLED = false quita las animaciones pero mantiene las verificaciones.
const INTRO_ENABLED = true;
const INTRO_TIMES   = { html: 800, css: 900, js: 1000, dev: 800, img: 1600 };   // ms mínimos de cada paso
const INTRO_MAX     = 12000;   // ms: si las imágenes no cargan en este tiempo, se considera un fallo
const INTRO_HOLD    = 650;     // ms que se queda el "Todo listo" antes de que el águila despegue
const INTRO_FLY     = 1500;    // ms que dura el vuelo del águila hasta el logo
// Imágenes de la carpeta "images" (incluye las de images/fondos-preguardados):
const INTRO_IMG_TOTAL = 103;   // las que debería haber
const INTRO_IMG_MIN   = 98;    // con 98 o más la página inicia (pueden faltar hasta 5, SOLO de fondos-preguardados)
// Las imágenes de la página y del buscador (todas las de images fuera de fondos-preguardados) son obligatorias:
// si falta una sola, la página no inicia, aunque el total llegue a 98.

// Partes del HTML sin las que la página no funciona
const INTRO_REQUIRED_IDS = ['searchForm', 'q', 'clockTime', 'greeting', 'date', 'shortcuts',
                            'scDialog', 'qs', 'bgBtn', 'bgPanel'];

/* Pantallas de error (el HTML y el CSS están en Start_Page.html y style_pc.css):
   404 = falta un archivo (style_pc.css...) o más de 5 imágenes; 106 = sin internet (106 manda sobre 404).
   Siguen el modo claro/oscuro del sistema. Para no usar la pantalla de "sin internet", pon ERR_OFFLINE_ENABLED = false. */
const ERR_OFFLINE_ENABLED = true;
const ERR_TEXTS = {
  404: { code: '404', title: 'Parece que algo se perdió',
         text: 'Falta un archivo o varias imágenes que AKON Search necesita para abrir.' },
  106: { code: '106', title: 'Sin conexión a internet',
         text: 'Revisa tu cable o tu Wi-Fi. Cuando vuelva el internet, la página se abre sola. O pulsa Ctrl + X para entrar sin internet.' }
};
let errKind = null;
function showErrorPage(kind, falta){
  const page = byId('errPage');
  if(!page || errKind === '106' || errKind === kind) return;
  errKind = kind;
  const t = ERR_TEXTS[kind];
  byId('errCode').textContent  = t.code;
  byId('errTitle').textContent = t.title;
  byId('errText').textContent  = t.text;
  const det = byId('errDetail');
  if(falta){ det.textContent = 'Falta: ' + String(falta).slice(0, 200); det.hidden = false; }
  else det.hidden = true;
  document.title = t.code + ' · AKON Search';
  page.hidden = false;
  page.classList.add('is-open');           // entra con animación (ver .err.is-open en style_pc.css)
  // La página se oculta por completo (con estilos en línea, para que funcione aunque style_pc.css sea lo que falta).
  // Se espera a que termine de aparecer la pantalla de error para que se vea como un cambio suave, sin parpadeo.
  const hidePage = () => { for(const el of [...document.body.children]) if(el !== page) el.style.setProperty('display', 'none', 'important'); };
  if(reducedMotion()) hidePage(); else setTimeout(hidePage, 600);
  if(kind === '106') window.addEventListener('online', () => location.reload(), { once: true });   // vuelve el internet: regresa sola
}

(function startIntro(){
  const intro = byId('intro');
  const body  = document.body;
  if(!intro) return;
  intro.classList.add('js-ok');       // script_pc.js sí cargó: se apaga la pantalla 404 automática de "falta script_pc.js"

  // Sin internet -> 106. Hoja de estilos que no cargó -> 404 (los demás archivos los revisa la pantalla de inicio)
  let skipOffline = false;
  try{ skipOffline = sessionStorage.getItem(SKIP_OFFLINE_KEY) === '1'; }catch(e){}
  if(ERR_OFFLINE_ENABLED && !skipOffline){
    if(navigator.onLine === false){ showErrorPage('106'); return; }
    window.addEventListener('offline', () => showErrorPage('106'));
  }
  const cssMissing = [...document.querySelectorAll('link[rel~="stylesheet"][href]')]
    .filter(l => { try{ return new URL(l.href).origin === location.origin; }catch(e){ return false; } })
    .filter(l => !(l.dataset.for === 'mobile' && document.documentElement.dataset.device !== 'mobile'))   // style_mov.css solo hace falta en celular
    .filter(l => !l.sheet)
    .map(l => (l.getAttribute('href') || '').split('/').pop());
  if(cssMissing.length){ showErrorPage('404', cssMissing.join(', ')); return; }

  // Recarga con Ctrl + R: sin pantalla de carga ni revisiones, la página aparece de una vez
  let skipIntro = false;
  try{ skipIntro = sessionStorage.getItem(SKIP_INTRO_KEY) === '1'; sessionStorage.removeItem(SKIP_INTRO_KEY); }catch(e){}
  if(offActive(OFF_CSS_KEY)) skipIntro = true;   // sin estilos la pantalla de carga no puede animarse
  if(skipIntro){
    body.classList.remove('intro-active', 'intro-name');
    intro.remove();
    return;
  }

  const fast = !INTRO_ENABLED || reducedMotion();
  const time = key => fast ? 0 : INTRO_TIMES[key];

  const logo      = byId('introLogo');
  const ring      = byId('introRing');
  const stepsEl   = byId('introSteps');
  const label     = byId('introLabel');
  const pct       = byId('introPct');
  const brandLogo = document.querySelector('.brand-logo');
  const RING_LEN  = 2 * Math.PI * 54;               // circunferencia del anillo (r = 54)
  const wait      = ms => new Promise(r => setTimeout(r, ms));
  const t0        = performance.now();

  // --- Algo falta: se muestra la pantalla 404 con lo que falta como detalle ---
  function failStart(problems){
    const names = problems.flatMap(pr => pr.files);
    showErrorPage('404', names.slice(0, 4).join(', ') + (names.length > 4 ? ` y ${names.length - 4} más` : ''));
  }

  // --- Lo que realmente se espera: imágenes de la página, fondos, fuentes y el evento "load" ---
  const absUrl = u => { try{ return new URL(u, document.baseURI).href; }catch(e){ return u; } };
  const safeDecode = t => { try{ return decodeURI(t); }catch(e){ return t; } };
  const inFondos = u => safeDecode(absUrl(u)).includes('/fondos-preguardados/');
  const baseDir  = absUrl('./');                                   // carpeta base: la del HTML
  const relative = u => safeDecode(absUrl(u)).replace(safeDecode(baseDir), '');   // ej. images/Gmail.png

  // Ruta corta para mostrar dónde se encontró un archivo: "…/Carpeta/archivo.css"
  function shortPath(url){
    let u;
    try{ u = new URL(url, document.baseURI); }catch(e){ return String(url); }
    let segs;
    try{ segs = decodeURIComponent(u.pathname).split('/').filter(Boolean); }catch(e){ segs = u.pathname.split('/').filter(Boolean); }
    let out = segs.pop() || '';
    while(segs.length && segs[segs.length - 1].length + out.length + 1 <= 34) out = segs.pop() + '/' + out;
    return (segs.length ? '…/' : '') + out;
  }

  // 1) Obligatorias: las de la página y del buscador (images/ sin contar fondos-preguardados) y el icono de pestaña
  const images = [...document.images].filter(img => !img.closest('#shortcuts, #qs'))
    .filter(img => !inFondos(img.getAttribute('src') || ''));
  const imgOk = img => img.complete && img.naturalWidth > 0;
  const iconLink = document.querySelector('link[rel~="icon"]');

  const reqItems = [];                      // en orden y sin repetir (una imagen puede usarse en varios lugares)
  const seen = new Set();
  for(const img of images){
    const key = absUrl(img.getAttribute('src') || '');
    if(seen.has(key)) continue;
    seen.add(key);
    reqItems.push({ label: relative(key), img, url: key, probe: bgExists(key) });
  }
  if(iconLink && iconLink.getAttribute('href')){
    const key = absUrl(iconLink.getAttribute('href'));
    if(!seen.has(key)) reqItems.push({ label: relative(key), probe: bgExists(key), url: key, icon: iconLink });
  }

  // 2) Revisión de las imágenes de una en una: primero las obligatorias y luego los fondos de
  //    images/fondos-preguardados (aquí sí pueden faltar algunos). "found" guarda cada una en el orden
  //    en que se encuentra; el contador de la pantalla de carga las va mostrando de una en una.
  // ---- Revisión a fondo: si una imagen no cargó, se investiga por qué y se prueban otras mayúsculas/minúsculas ----
  // (GitHub Pages distingue mayúsculas: "logo.png" y "Logo.png" son archivos distintos)
  const capFirst = t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  // Todas las combinaciones de mayúsculas/minúsculas de un nombre (solo si tiene pocas letras: 2^letras pruebas)
  function caseCombos(name, max){
    const idx = [...name].map((c, i) => /\p{L}/u.test(c) ? i : -1).filter(i => i >= 0);
    if(idx.length > max) return [];
    const out = [];
    for(let m = 0; m < (1 << idx.length); m++){
      const a = [...name];
      idx.forEach((pos, k) => { a[pos] = (m >> k) & 1 ? a[pos].toUpperCase() : a[pos].toLowerCase(); });
      out.push(a.join(''));
    }
    return out;
  }
  function urlVariants(url, allExts){
    let u; try{ u = new URL(url); }catch(e){ return []; }
    const slash = u.pathname.lastIndexOf('/');
    const dir   = u.pathname.slice(0, slash + 1);
    const file  = safeDecode(u.pathname.slice(slash + 1));
    const dot   = file.lastIndexOf('.');
    if(dot < 1) return [];
    const name = file.slice(0, dot), ext = file.slice(dot);
    const simple = [...new Set([name, name.toLowerCase(), name.toUpperCase(), capFirst(name), name.charAt(0).toLowerCase() + name.slice(1)])];
    const ext3   = [...new Set([ext, ext.toLowerCase(), ext.toUpperCase()])];
    const wide   = [...new Set([...ext3, ...(allExts ? ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico'] : [])])];
    const combos = allExts ? caseCombos(name, 6) : [];      // ej. "3WiFi" → 3wifi, 3wiFi, 3wIfi... (hasta 6 letras)
    const seenF = new Set([file]), out = [];
    const add = (n, e) => {
      const f = n + e;
      if(seenF.has(f)) return;
      seenF.add(f);
      out.push({ file: f, url: u.origin + dir + encodeURIComponent(f) + u.search });
    };
    simple.forEach(n => wide.forEach(e => add(n, e)));
    combos.forEach(n => ext3.forEach(e => add(n, e)));
    return out;
  }

  // Lista real de archivos de una carpeta del sitio (solo en GitHub Pages, y solo cuando algo falla).
  // Sirve para encontrar el archivo sin importar cómo esté escrito. Necesita https://api.github.com en connect-src del HTML.
  const ghDirCache = {};
  function ghListDir(dirPath){
    const host = location.hostname;
    if(!/\.github\.io$/i.test(host)) return Promise.resolve(null);
    if(ghDirCache[dirPath]) return ghDirCache[dirPath];
    const ckey = 'startpage_ghdir:' + dirPath;
    try{                                                                       // lista guardada hace menos de 10 min (así no se gastan las consultas de GitHub)
      const c = JSON.parse(localStorage.getItem(ckey) || 'null');
      if(c && Array.isArray(c.names) && Date.now() - c.t < 600000) return ghDirCache[dirPath] = Promise.resolve(c.names);
    }catch(e){}
    const owner = host.split('.')[0];
    const segs  = dirPath.split('/').filter(Boolean).map(safeDecode);
    const tries = [];
    if(segs.length) tries.push({ repo: segs[0], path: segs.slice(1) });     // página de proyecto: usuario.github.io/Repo/...
    tries.push({ repo: host, path: segs });                                  // página de usuario: usuario.github.io/...
    return ghDirCache[dirPath] = (async () => {
      for(const t of tries){
        try{
          const api = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(t.repo) + '/contents/' + t.path.map(encodeURIComponent).join('/');
          const r = await fetch(api, { headers: { Accept: 'application/vnd.github+json' } });
          if(!r.ok) continue;
          const list = await r.json();
          if(Array.isArray(list)){
            const names = list.filter(x => x.type === 'file').map(x => x.name);
            try{ localStorage.setItem(ckey, JSON.stringify({ t: Date.now(), names })); }catch(e){}
            return names;
          }
        }catch(e){}
      }
      return null;
    })();
  }
  // Devuelve { avail: false } si no se pudo consultar a GitHub, o { avail: true, hit } (hit = null si de verdad no existe con ningún nombre)
  async function ghFindReal(url){
    let u; try{ u = new URL(url); }catch(e){ return { avail: false }; }
    if(u.origin !== location.origin) return { avail: false };
    const slash = u.pathname.lastIndexOf('/');
    const dir   = u.pathname.slice(0, slash + 1);
    const names = await ghListDir(dir);
    if(!names) return { avail: false };
    const want = safeDecode(u.pathname.slice(slash + 1)).toLowerCase();
    const base = w => w.replace(/\.[^.]+$/, '');
    const real = names.find(n => n.toLowerCase() === want)
              || names.find(n => /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(n) && base(n).toLowerCase() === base(want));   // misma palabra, otra extensión
    return { avail: true, hit: real ? { file: real, url: u.origin + dir + encodeURIComponent(real) + u.search } : null };
  }
  async function deepCheck(url, allExts, quick){
    // "quick" (fondos): ya se sabe que no existe con ese nombre; solo se busca con otro nombre y no se pierde tiempo en diagnósticos
    let status = 0, bytes = 0;
    if(!quick){
      // 1) ¿existe de verdad? Se pide sin caché y se comprueba que sea una imagen que el navegador pueda abrir
      try{
        const r = await fetch(url, { cache: 'no-store' });
        status = r.status;
        if(r.ok){
          const blob = await r.blob();
          bytes = blob.size;
          if(bytes > 0){
            const tmp = URL.createObjectURL(blob);
            const good = await bgProbe(tmp);
            URL.revokeObjectURL(tmp);
            if(good) return { ok: true, url, note: 'cargó al revisarla a fondo (probablemente era la caché)' };
          }
        }
      }catch(e){ status = -1; }
    }
    // 2a) Se pregunta a GitHub cómo se llama de verdad el archivo en esa carpeta (cualquier combinación de mayúsculas)
    const gh = await ghFindReal(url);
    if(gh.avail && gh.hit && await bgExists(gh.hit.url)) return { ok: true, url: gh.hit.url, file: gh.hit.file, note: 'existe como "' + gh.hit.file + '" (cambia el nombre en el código o en GitHub)' };
    // 2b) Si GitHub no se pudo consultar, se prueban las combinaciones una por una
    if(!gh.avail){
      const vars = urlVariants(url, allExts);
      const hits = await Promise.all(vars.map(async v => (await bgExists(v.url)) ? v : null));
      const hit  = hits.find(Boolean);
      if(hit) return { ok: true, url: hit.url, file: hit.file, note: 'existe como "' + hit.file + '" (cambia el nombre en el código o en GitHub)' };
    }
    // 3) No está: se dice por qué
    const why = status === 404 ? 'no existe (404)'
              : status === 200 ? (bytes === 0 ? 'el archivo está vacío' : 'el archivo está dañado o no es una imagen')
              : status === -1  ? 'no se pudo consultar'
              : 'error ' + status;
    return { ok: false, why };
  }

  // Si falta una imagen obligatoria se puede usar una copia suya con otro nombre (clave en minúsculas → archivo de images/)
  const IMG_FALLBACKS = { 'start_page.png': 'Logo.png' };

  // Limpia lo que la página guarda como caché (Cache Storage y las listas de nombres de GitHub).
  // NO toca tus ajustes (fondo elegido, tema, etc.). El caché normal del navegador no se puede vaciar desde una página.
  async function clearCaches(){
    try{ if(window.caches){ const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } }catch(e){}
    try{ Object.keys(localStorage).filter(k => k.startsWith('startpage_ghdir:')).forEach(k => localStorage.removeItem(k)); }catch(e){}
    for(const k of Object.keys(ghDirCache)) delete ghDirCache[k];
  }
  clearCaches();                                           // al empezar la pantalla de carga
  const inspect = { done: false, found: [], reqMissing: [], fondosMissing: [], usedFallback: [] };
  (async () => {
    const deadline = t0 + INTRO_MAX;
    for(const it of reqItems){
      // Solo se pregunta "¿existe?" (sin descargar la imagen y sin revisar si está completa o dañada)
      let ok = await it.probe;
      if(!ok){
        const res = await deepCheck(it.url, true);
        if(res.ok){
          ok = true;
          console.warn('[Imágenes] ' + it.label + ': ' + res.note);
          if(it.img){ it.img.src = res.url; it.img.style.display = ''; }
          if(it.icon) it.icon.href = res.url;
        }else{
          // Imagen de respaldo: si no está esta, se usa su copia con otro nombre (misma imagen, distinto archivo)
          const fbName = IMG_FALLBACKS[safeDecode(it.url).split('/').pop().toLowerCase()];
          const fbUrl  = fbName ? absUrl('images/' + fbName) : '';
          if(fbUrl && await bgExists(fbUrl)){
            ok = true;
            console.warn('[Imágenes] No se encontró ' + it.label + ' (' + res.why + '). Se carga images/' + fbName + ' en su lugar: es la misma imagen con otro nombre, pero conviene arreglar el archivo original.');
            if(it.img){ it.img.src = fbUrl; it.img.style.display = ''; }
            if(it.icon) it.icon.href = fbUrl;
            inspect.usedFallback.push(it.label + ' → images/' + fbName);
          }else{
            it.label += ' — ' + res.why;
          }
        }
      }
      (ok ? inspect.found : inspect.reqMissing).push(it.label);
    }
    await bgScanDone.catch(() => {});
    // Fondos: todos se revisan a la vez (antes uno por uno y descargando cada imagen); el orden de la lista se conserva
    const jobs = [];
    for(const cat of BG_CATEGORIES) for(const file of [...cat.files]) jobs.push({ cat, file, path: cat.folder + file });
    const results = await Promise.all(jobs.map(async job => {
      const rel = bgImage(job.path).slice(5, -2);
      let ok = await bgExists(rel);
      if(!ok){
        const res = await deepCheck(absUrl(rel), false, true);
        if(res.ok && res.file){
          const i = job.cat.files.indexOf(job.file);
          if(i >= 0) job.cat.files[i] = res.file;            // se usa el nombre real (con sus mayúsculas)
          console.warn('[Fondos] ' + BG_FOLDER + job.path + ': ' + res.note);
          ok = true;
        }
      }
      return ok;
    }));
    jobs.forEach((job, k) => (results[k] ? inspect.found : inspect.fondosMissing).push(BG_FOLDER + job.path));
    inspect.done = true;
  })();

  let fontsReady = !document.fonts, pageLoaded = document.readyState === 'complete';
  if(document.fonts) document.fonts.ready.then(() => { fontsReady = true; });
  if(!pageLoaded) addEventListener('load', () => { pageLoaded = true; }, { once: true });
  const foundNow = () => inspect.found.length;      // imágenes encontradas (obligatorias + fondos)

  // Contador: muestra las imágenes encontradas de una en una (1, 2, 3... hasta el total) con el nombre de la que acaba de encontrar
  let revealed = 0, revealStop = false;
  function startReveal(row){
    const detail = row.querySelector('.st-detail');
    const where  = row.querySelector('.st-where');
    let last = performance.now(), acc = 0;
    const frame = now => {
      acc += now - last;
      last = now;
      const total = inspect.found.length;
      if(fast){
        revealed = total;
      }else{
        const interval = Math.max(10, Math.min(30, 2600 / Math.max(1, INTRO_IMG_TOTAL, total)));   // ≈ 2.6 s para llegar a 103
        while(acc >= interval && revealed < total){ revealed++; acc -= interval; }
        if(revealed >= total) acc = 0;                // sin imágenes nuevas no se acumula tiempo
      }
      if(revealed){
        detail.textContent = `${revealed}/${INTRO_IMG_TOTAL}`;
        where.textContent  = inspect.found[revealed - 1];
      }
      if(!revealStop) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // --- Verificaciones de cada paso: devuelven null si está bien o {title, files} si falta algo ---
  function checkHtml(){
    const missing = INTRO_REQUIRED_IDS.filter(id => !document.getElementById(id));
    return missing.length ? { title: 'Falta una parte del HTML', files: missing.map(id => '#' + id) } : null;
  }
  function checkCss(){
    const links   = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter(l => !/^(https?:)?\/\//i.test(l.getAttribute('href') || ''));   // solo las hojas locales
    const missing = links.filter(l => !l.sheet).map(l => l.getAttribute('href'));
    const styled  = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() !== '';
    if(!missing.length && !styled) missing.push('style_pc.css');
    return missing.length ? { title: 'No se cargó la hoja de estilos (CSS)', files: missing } : null;
  }
  function checkImages(){
    const out  = [];
    const miss = inspect.reqMissing;
    if(miss.length) out.push({ title: `Falta${miss.length > 1 ? 'n' : ''} ${miss.length} ${miss.length > 1 ? 'imágenes' : 'imagen'} de la carpeta images (estas son obligatorias)`, files: miss });
    if(!inspect.done) out.push({ title: 'No se pudo terminar de revisar la carpeta images', files: [] });
    // Las obligatorias están bien: lo que se pide es llegar al mínimo de imágenes en total
    if(!out.length && foundNow() < INTRO_IMG_MIN){
      out.push({ title: `Solo se encontraron ${foundNow()} imágenes en la carpeta images; se necesitan al menos ${INTRO_IMG_MIN} de ${INTRO_IMG_TOTAL}`,
                 files: inspect.fondosMissing.length ? inspect.fondosMissing : ['(agrega más imágenes a fondos-preguardados)'] });
    }
    return out;
  }

  // --- Pasos. "weight" es lo que pesa en el anillo; "time" lo mínimo que se ve cada uno. ---
  const steps = [
    { name: 'HTML',       weight: .10, time: time('html'), ready: () => document.readyState !== 'loading',
      found: 'encontrado',
      file:  () => location.href,
      check: () => [checkHtml()] },
    { name: 'CSS',        weight: .10, time: time('css'),  ready: () => true,
      found: 'encontrado',
      file:  () => { const l = [...document.querySelectorAll('link[rel="stylesheet"]')].find(l => !/^(https?:)?\/\//i.test(l.getAttribute('href') || '')); return l ? l.href : absUrl('style_pc.css'); },
      check: () => [checkCss()] },
    { name: 'JavaScript', weight: .10, time: time('js'),   ready: () => true,
      found: 'encontrado',
      file:  () => { const sc = [...document.scripts].find(x => /script_pc\.js(\?|$)/.test(x.src)); return sc ? sc.src : absUrl('script_pc.js'); },
      check: () => [] },                     // si este código está corriendo, el JS cargó
    { name: 'Dispositivo', weight: .05, time: time('dev'), ready: () => true,       // ¿computadora o móvil?
      found: () => deviceName(currentDevice || applyDevice()),
      where: () => (currentDevice || applyDevice()).how,
      check: () => { applyDevice(); return []; } },
    { name: 'Imágenes',   weight: .65, time: time('img'),
      onStart: row => startReveal(row),
      ready:  () => inspect.done && revealed >= inspect.found.length && fontsReady,
      real:   () => {
        const imgPart = inspect.done ? (inspect.found.length ? revealed / inspect.found.length : 1)
                                     : Math.min(.95, revealed / INTRO_IMG_TOTAL);
        return .85 * imgPart + .15 * (fontsReady ? 1 : 0);
      },
      detail: () => `${revealed}/${INTRO_IMG_TOTAL}`,
      check:  () => checkImages() }
  ];

  const rows = steps.map(st => {
    const li = document.createElement('li');
    li.className = 'pending';
    li.innerHTML = '<span class="st-ico"><span class="st-dot"></span><span class="st-spin"></span>'
      + '<svg class="st-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17.5 19 7.5"></polyline></svg>'
      + '<svg class="st-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg></span>'
      + '<span class="st-name"></span><span class="st-detail"></span><span class="st-where"></span><span class="st-bar"><i></i></span>';
    li.querySelector('.st-name').textContent = st.name;   // texto fijo del código
    stepsEl.append(li);
    return li;
  });

  // --- Anillo y porcentaje: avanzan suave hacia lo que llevan los pasos ---
  let target = 0, shown = 0, finished = false;
  const ringSettled = new Promise(resolve => {
    let last = t0;
    const frame = now => {
      const dt = now - last;
      last = now;
      shown += (target - shown) * (1 - Math.exp(-dt / 140));
      if(target - shown < 0.004) shown = target;
      ring.style.strokeDashoffset = RING_LEN * (1 - shown);
      if(!finished) pct.textContent = Math.round(shown * 100) + '%';
      if(finished && shown >= target) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  async function runSteps(){
    const problems = [];
    let doneWeight = 0;
    for(const [i, st] of steps.entries()){
      const row     = rows[i];
      const bar     = row.querySelector('.st-bar i');
      const detail  = row.querySelector('.st-detail');
      const where   = row.querySelector('.st-where');
      const started = performance.now();
      row.className = 'active';
      if(st.file) where.textContent = 'buscando…';
      if(st.onStart) st.onStart(row);

      for(;;){
        const now     = performance.now();
        const elapsed = now - started;
        const forced  = now - t0 > INTRO_MAX;
        const ready   = st.ready();
        const byTime  = st.time ? Math.min(1, elapsed / st.time) : 1;
        // Nunca va más rápido que el tiempo mínimo ni que lo que realmente ha cargado
        const frac    = Math.min(byTime, st.real ? st.real() : 1, ready ? 1 : .97);
        bar.style.transform = `scaleX(${frac})`;
        detail.textContent  = st.detail ? st.detail() : Math.round(frac * 100) + '%';
        target = doneWeight + st.weight * frac;
        if(forced || (ready && elapsed >= st.time)) break;
        await wait(40);
      }

      const found = st.check().flat().filter(Boolean);
      problems.push(...found);
      if(!st.detail) detail.textContent = found.length ? 'no encontrado' : (typeof st.found === 'function' ? st.found() : st.found);
      else{
        revealStop = true;                       // termina el conteo: queda el total encontrado
        revealed = foundNow();
        detail.textContent = `${revealed}/${INTRO_IMG_TOTAL}`;
      }
      // Dónde se encontró (o dónde se buscó y no estaba)
      if(st.where) where.textContent = st.where();                     // paso con su propio texto (Dispositivo)
      else if(st.file) where.textContent = (found.length ? 'no se encontró: ' : '') + shortPath(st.file());
      else where.textContent = `${shortPath(absUrl('images/'))} · ${foundNow()} archivos`;
      bar.style.transform = 'scaleX(1)';
      row.className = found.length ? 'failed' : 'done';
      doneWeight += st.weight;
      target = found.length ? target : doneWeight;
    }
    return problems;
  }

  // --- El águila vuela desde el centro hasta el logo de la esquina, en arco, inclinándose y
  //     dejando una estela. Al llegar, una onda marca el lugar. ---
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // El águila recuerda dónde empezó (home) y dónde está ahora (pose), así puede encadenar vuelos:
  // centro → recuadro de la contraseña → logo de la esquina.
  let home = null;
  let pose = { x: 0, y: 0, s: 1 };
  const poseFor = rect => {
    if(!home) home = logo.getBoundingClientRect();
    return {
      x: (rect.left + rect.width  / 2) - (home.left + home.width  / 2),
      y: (rect.top  + rect.height / 2) - (home.top  + home.height / 2),
      s: rect.width / home.width
    };
  };

  async function flyTo(toRect, duration){
    const t  = poseFor(toRect);
    const dx = t.x - pose.x, dy = t.y - pose.y;

    // Curva: el punto de control se aparta de la línea recta, hacia arriba, para que sea un arco
    const dist = Math.hypot(dx, dy) || 1;
    let nx = dy / dist, ny = -dx / dist;               // perpendicular a la trayectoria
    if(ny > 0){ nx = -nx; ny = -ny; }                  // la que apunta hacia arriba
    const cx = dx / 2 + nx * dist * .35;
    const cy = dy / 2 + ny * dist * .35;
    const bank = dx < 0 ? -1 : 1;                      // hacia qué lado se inclina

    const frames = [];
    const N = 70;
    for(let i = 0; i <= N; i++){
      const k = i / N, e = ease(k), u = 1 - e;
      const x = pose.x + 2 * u * e * cx + e * e * dx;  // curva de Bézier cuadrática
      const y = pose.y + 2 * u * e * cy + e * e * dy;
      const swoop = 1 + .12 * Math.sin(Math.PI * k);                          // se acerca y se aleja
      const sc    = (pose.s + (t.s - pose.s) * e) * swoop;
      const flap  = 1 + .07 * Math.sin(k * Math.PI * 7) * Math.sin(Math.PI * k);   // aleteo
      const rot   = bank * 16 * Math.sin(Math.PI * k) * (1 - k * .3);         // inclinación en la curva
      frames.push({ transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${sc * flap}, ${sc})` });
    }
    frames[N].transform = `translate(${t.x}px, ${t.y}px) rotate(0deg) scale(${t.s})`;   // aterriza exacto

    const fly = logo.animate(frames, { duration, easing: 'linear', fill: 'forwards' });

    // Estela: pequeñas luces que se van apagando donde estuvo el águila
    let lastDrop = 0, flying = true;
    const trail = now => {
      if(!flying) return;
      if(now - lastDrop > 28){
        lastDrop = now;
        const r = logo.getBoundingClientRect();
        const size = 4 + Math.random() * 7;
        const p = document.createElement('i');
        p.className = 'intro-trail';
        p.style.cssText = `left:${r.left + r.width / 2 + (Math.random() - .5) * r.width * .5 - size / 2}px;`
          + `top:${r.top + r.height / 2 + (Math.random() - .5) * r.height * .5 - size / 2}px;`
          + `width:${size}px;height:${size}px;--tx:${(Math.random() - .5) * 30}px;--ty:${10 + Math.random() * 26}px;`;
        p.addEventListener('animationend', () => p.remove());
        body.append(p);
      }
      requestAnimationFrame(trail);
    };
    requestAnimationFrame(trail);

    await fly.finished;
    flying = false;
    pose = t;
  }

  const canFlyNow = () => !fast && logo && logo.naturalWidth > 0;

  // Con contraseña: el águila vuela al borde de arriba del recuadro y espera ahí hasta que la contraseña sea correcta
  async function dockOnLock(){
    if(!canFlyNow() || !window.AKON_LOCK || !AKON_LOCK.pending()) return;
    intro.classList.add('is-leaving', 'is-fading', 'is-docked');
    intro.style.zIndex = '5001';            // por encima del candado (z-index 5000)
    intro.style.pointerEvents = 'none';     // para poder escribir la contraseña
    const info = AKON_LOCK.showForIntro();
    if(info.slot){
      await wait(60);                       // deja que el recuadro tome su sitio
      await flyTo(info.slot.getBoundingClientRect(), 1300);
      // Si cambia el tamaño de la ventana, el águila sigue al recuadro
      const follow = () => {
        const t = poseFor(info.slot.getBoundingClientRect());
        pose = t;
        logo.animate([{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }], { duration: 0, fill: 'forwards' });
      };
      window.addEventListener('resize', follow);
      await info.unlocked;
      window.removeEventListener('resize', follow);
    }else{
      await info.unlocked;
    }
    intro.classList.remove('is-docked');
  }

  // Sin contraseña (o ya correcta): el águila vuela hasta el logo de la esquina y aterriza
  async function flyLogo(){
    intro.classList.add('is-leaving');   // desaparecen anillo, pasos, check y texto
    intro.classList.add('is-fading');    // el fondo se desvanece y deja ver la página
    body.classList.add('intro-reveal');  // el resto de la página aparece escalonado

    const canFly = canFlyNow() && brandLogo && brandLogo.getBoundingClientRect().width > 0;
    if(!canFly){ await wait(fast ? 0 : 700); return; }

    const to = brandLogo.getBoundingClientRect();
    setTimeout(() => body.classList.remove('intro-name'), INTRO_FLY * 0.72);   // el nombre aparece al llegar
    await flyTo(to, INTRO_FLY);

    // Onda en el punto de aterrizaje
    const ripple = document.createElement('i');
    ripple.className = 'land-ripple';
    ripple.style.cssText = `left:${to.left}px;top:${to.top}px;width:${to.width}px;height:${to.height}px;`;
    ripple.addEventListener('animationend', () => ripple.remove());
    body.append(ripple);
  }

  (async () => {
    let problems;
    try{
      problems = await runSteps();
    }catch(e){
      problems = [{ title: 'Ocurrió un error al revisar los archivos', files: [String(e && e.message || e)] }];
    }

    finished = true;
    clearCaches();                                         // al terminar de verificar todo: se entra al buscador "limpio"
    if(problems.length){
      // Algo falta: se deja ver qué paso falló y la página no inicia
      label.textContent = 'No se pudo iniciar';
      pct.textContent   = '';
      intro.classList.add('has-error');
      await wait(fast ? 0 : 1100);
      failStart(problems);
      return;
    }

    try{
      target = 1;
      await ringSettled;
      intro.classList.add('is-done');
      const lacking = INTRO_IMG_TOTAL - foundNow();
      label.textContent = lacking > 0 ? `Todo listo · faltan ${lacking} fondos` : 'Todo listo';
      pct.textContent   = '';
      await wait(fast ? 0 : INTRO_HOLD);
      await dockOnLock();
      await flyLogo();
    }catch(e){
      // si falla solo la animación, igual se muestra la página
    }finally{
      body.classList.remove('intro-active', 'intro-name');
      intro.remove();
      if(!fast){
        body.classList.add('intro-landed');
        setTimeout(() => body.classList.remove('intro-landed'), 900);
      }
    }
  })();
})();

/* =========================================================
   Pantalla de Ajustes: se abre con el botón "Administrar más ajustes" del panel Personalizar.
   Usa lo que ya existe en script_pc.js (setTheme, setEngine, los interruptores del panel...).
   ========================================================= */
(() => {
  const $ = id => document.getElementById(id);
  const moreBtn = $('bgMore');
  if(!moreBtn) return;

  const ENGINE_KEY = 'startpage_default_engine';
  const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    home:   svg('<path d="M3 11l9-8 9 8"/><path d="M5 9.5V20h14V9.5"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/>'),
    clock:  svg('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>'),
    look:   svg('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>'),
    cloud:  svg('<path d="M18 10a6 6 0 0 0-11.7-1.5A4.5 4.5 0 0 0 7 18h11a4 4 0 0 0 0-8z"/>'),
    lock:   svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    info:   svg('<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12" y2="8.01"/>'),
    back:   svg('<polyline points="15 18 9 12 15 6"/>')
  };

  function el(tag, cls, text){
    const n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text != null) n.textContent = text;
    return n;
  }
  const rows = [];      // todas las filas, para el buscador
  const syncs = [];     // funciones que releen el estado al abrir

  function row(label, desc, control){
    const r = el('div', 'st-row');
    const t = el('div'); t.append(document.createTextNode(label));
    // desc puede ser texto o un elemento ya armado (por ejemplo una lista)
    const descText = desc instanceof Node ? desc.textContent : (desc || '');
    if(desc instanceof Node){ const sm = el('small'); sm.append(desc); t.append(sm); }
    else if(desc) t.append(el('small', '', desc));
    r.append(t);
    if(control) r.append(control);
    r.dataset.q = (label + ' ' + descText).toLowerCase();
    rows.push(r);
    return r;
  }

  // Interruptor ligado a un control que ya existe en el panel Personalizar
  function linkedSwitch(label, desc, ctlId){
    const ctl = $(ctlId);
    const wrap = el('label', 'st-switch');
    const cb = el('input'); cb.type = 'checkbox';
    wrap.append(cb, el('span'));
    if(ctl){
      cb.addEventListener('change', () => { ctl.checked = cb.checked; ctl.dispatchEvent(new Event('change', { bubbles: true })); });
      syncs.push(() => { cb.checked = ctl.checked; });
    }
    return row(label, desc, wrap);
  }
  // Lista desplegable propia (el <select> nativo no se puede animar): se abre y se cierra con animación
  let openDd = null;
  function closeDd(){
    if(!openDd) return;
    openDd.dd.classList.remove('open');
    openDd.btn.setAttribute('aria-expanded', 'false');
    openDd = null;
  }
  document.addEventListener('pointerdown', e => { if(openDd && !openDd.dd.contains(e.target)) closeDd(); });

  function linkedSelect(label, desc, ctlId, options){
    const ctl = $(ctlId);
    const dd  = el('div', 'st-dd');
    const btn = el('button', 'st-select'); btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    const val = el('span', 'st-val');          // caja que recorta el texto mientras se desliza
    const txt = el('span', 'st-cur');
    val.append(txt);
    btn.append(val);
    btn.insertAdjacentHTML('beforeend', '<svg class="st-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>');
    const menu = el('ul', 'st-menu'); menu.setAttribute('role', 'listbox');
    let value = options[0][0];

    const items = options.map(([v, t], i) => {
      const li = el('li', 'st-item', t);
      li.dataset.v = v; li.tabIndex = -1; li.setAttribute('role', 'option');
      li.style.setProperty('--i', i);
      menu.append(li);
      return li;
    });
    const paint = () => {
      const cur = options.find(o => o[0] === value) || options[0];
      txt.textContent = cur[1];
      items.forEach(li => li.setAttribute('aria-selected', String(li.dataset.v === cur[0])));
    };
    // El número viejo sale y el nuevo entra; la dirección depende de si subes o bajas en la lista
    const slide = (oldText, dir) => {
      if(reducedMotion()) return;
      const ghost = el('span', 'st-ghost', oldText);
      val.append(ghost);
      ghost.animate(
        [{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-dir * 70}%)`, opacity: 0 }],
        { duration: 240, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }
      ).onfinish = () => ghost.remove();
      txt.animate(
        [{ transform: `translateY(${dir * 70}%)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' }
      );
    };
    const choose = v => {
      const from = options.findIndex(o => o[0] === value), to = options.findIndex(o => o[0] === v);
      const oldText = txt.textContent;
      value = v; paint();
      if(from !== to) slide(oldText, to > from ? 1 : -1);
      if(ctl){ ctl.value = v; ctl.dispatchEvent(new Event('change', { bubbles: true })); }
      closeDd(); btn.focus();
    };
    const openMenu = () => {
      if(openDd && openDd.dd !== dd) closeDd();
      dd.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
      openDd = { dd, btn };
      const sel = items.find(li => li.dataset.v === value) || items[0];
      setTimeout(() => {
        sel.focus({ preventScroll: true });
        if(menu.scrollHeight > menu.clientHeight) menu.scrollTop = Math.max(0, sel.offsetTop - menu.clientHeight / 2 + sel.offsetHeight / 2);
      }, 30);
    };
    btn.addEventListener('click', () => dd.classList.contains('open') ? closeDd() : openMenu());
    btn.addEventListener('keydown', e => {
      if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); openMenu(); }
    });
    menu.addEventListener('click', e => { const li = e.target.closest('.st-item'); if(li) choose(li.dataset.v); });
    menu.addEventListener('keydown', e => {
      const i = items.indexOf(document.activeElement);
      if(e.key === 'ArrowDown'){ e.preventDefault(); items[Math.min(items.length - 1, i + 1)].focus(); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); items[Math.max(0, i - 1)].focus(); }
      else if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); if(i >= 0) choose(items[i].dataset.v); }
      else if(e.key === 'Tab'){ closeDd(); }
      else if(e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey){      // escribe una letra para saltar a esa opción
        const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const k = norm(e.key), n = items.length;
        for(let step = 1; step <= n; step++){
          const li = items[(Math.max(0, i) + step) % n];
          if(norm(li.textContent).startsWith(k)){ li.focus(); break; }
        }
      }
    });
    dd.append(btn, menu);
    paint();
    if(ctl) syncs.push(() => { value = ctl.value; paint(); });
    return row(label, desc, dd);
  }
  /* ---------- Botón "el bote se come la etiqueta" ----------
     Al confirmar, se abre la tapa del bote, las letras caen dentro una a una,
     la tapa se cierra y el botón se encoge hasta ser un círculo. Luego corre la acción. */
  let binUid = 0;
  const binSvg = () => {
    const id = 'stBinClip' + (++binUid);
    return svg('<defs><clipPath id="' + id + '"><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6z"/></clipPath></defs>' +
      '<g clip-path="url(#' + id + ')"><rect class="bin-fill" x="4" y="6" width="16" height="17"/></g>' +
      '<g class="bin-lid"><path d="M3 6h18"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></g>' +
      '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>');
  };
  function eatLabel(b, text){
    b.textContent = '';
    b.setAttribute('aria-label', text);
    const ic = el('span', 'st-bin'); ic.innerHTML = binSvg(); ic.setAttribute('aria-hidden', 'true');
    const lb = el('span', 'st-eat-l'); lb.setAttribute('aria-hidden', 'true');
    [...text].forEach((ch, i) => {
      const sp = el('span', '', ch === ' ' ? '\u00a0' : ch);
      sp.style.setProperty('--i', i);
      lb.append(sp);
    });
    b.append(ic, lb);
  }
  function eatPlay(b, done){
    if(b.dataset.eating) return;
    const calm = document.documentElement.classList.contains('reduce-motion') ||
                 (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if(calm){ done(); return; }
    b.dataset.eating = '1';
    const r0 = b.getBoundingClientRect();
    b.dataset.w = r0.width;
    b.style.width = r0.width + 'px'; b.style.height = r0.height + 'px';
    const bin = b.querySelector('.st-bin').getBoundingClientRect();
    const bx = bin.left + bin.width / 2, by = bin.top + bin.height / 2;
    const letters = [...b.querySelectorAll('.st-eat-l span')];
    letters.forEach(sp => {
      const r = sp.getBoundingClientRect();
      sp.style.setProperty('--dx', (bx - (r.left + r.width / 2)).toFixed(1) + 'px');
      sp.style.setProperty('--dy', (by - (r.top + r.height / 2)).toFixed(1) + 'px');
      sp.style.setProperty('--r', ((Math.random() * 70) - 35).toFixed(0) + 'deg');
    });
    b.classList.add('eating');
    // el bote se va llenando: cada letra que cae sube el nivel
    const n = letters.length;
    letters.forEach((sp, i) => setTimeout(() => b.style.setProperty('--fill', ((i + 1) / n).toFixed(3)), 120 + i * 38 + 340));
    const flight = 120 + letters.length * 38 + 420;
    setTimeout(() => {
      b.classList.add('closed');
      b.style.width = r0.height + 'px';
      setTimeout(done, 480);
    }, flight);
  }
  function eatReset(b){
    if(!b.dataset.eating) return;
    b.classList.remove('closed');
    b.style.setProperty('--fill', 0);
    b.style.width = b.dataset.w + 'px';
    setTimeout(() => {
      b.classList.remove('eating');
      b.style.width = b.style.height = '';
      delete b.dataset.eating; delete b.dataset.w;
    }, 280);
  }

  // Botón que pide una segunda confirmación (sin ventanas emergentes)
  function actionButton(label, desc, btnText, fn, danger){
    const b = el('button', 'st-btn' + (danger ? ' danger' : ''));
    b.type = 'button';
    const paint = txt => { if(danger) eatLabel(b, txt); else b.textContent = txt; };
    paint(btnText);
    let timer = 0;
    b.addEventListener('click', () => {
      if(b.dataset.eating) return;
      if(!danger){ fn(b); return; }
      if(b.classList.contains('armed')){
        clearTimeout(timer); b.classList.remove('armed');
        paint(btnText);
        eatPlay(b, () => { fn(b); setTimeout(() => eatReset(b), 400); });
        return;
      }
      b.classList.add('armed'); paint('¿Seguro? Clic otra vez');
      timer = setTimeout(() => { b.classList.remove('armed'); paint(btnText); }, 3500);
    });
    return row(label, desc, b);
  }
  // Lista de atajos de teclado (una línea por atajo: la tecla y lo que hace). Para agregar uno, copia una línea.
  function shortcutsList(){
    const items = [
      ['Ctrl + V',  'Abre el buscador rápido.'],
      ['Ctrl + R',  'Recarga la página sin pantalla de carga.'],
      ['Ctrl + X',  'Salta la verificación de internet y abre la página sin conexión.'],
      ['Ctrl + A',  'Vuelve a activar el CSS y el JavaScript si desactivaste alguno.']
    ];
    const ul = el('ul', 'st-keys');
    for(const [key, text] of items){
      const li = el('li');
      li.append(el('kbd', 'st-key', key), el('span', '', text));
      ul.append(li);
    }
    return ul;
  }
  // Tarjetas que solo existen en computadora (en el celular no hay pie de página): se marcan y no se muestran ni se buscan en el celular
  const pcOnly = c => { c.classList.add('st-pc-only'); return c; };
  function card(title, intro, ...rs){
    const c = el('section', 'st-card');
    c.append(el('h3', '', title));
    if(intro) c.append(el('p', '', intro));
    c.append(...rs);
    return c;
  }
  const store = {
    get: k => { try{ return localStorage.getItem(k); }catch(e){ return null; } },
    del: k => { try{ localStorage.removeItem(k); }catch(e){} }
  };

  /* ---------- Ventana flotante del historial ---------- */
  const readHistory  = () => { try{ return loadHistory(); }catch(e){ return []; } };
  const writeHistory = items => {
    try{ saveHistory(items); }
    catch(e){ try{ localStorage.setItem('startpage_history', JSON.stringify(items)); }catch(_){} }
  };
  const TRASH = svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>');

  function historyRow(label, desc){
    const b = el('button', 'st-btn'); b.type = 'button';
    eatLabel(b, 'Borrar historial');
    b.setAttribute('aria-haspopup', 'dialog');
    b.addEventListener('click', () => {
      if(b.dataset.eating) return;
      eatPlay(b, () => { openHistory(b); setTimeout(() => eatReset(b), 350); });
    });
    return row(label, desc, b);
  }

  const histModal = el('div', 'st-modal'); histModal.setAttribute('aria-hidden', 'true');
  const win = el('div', 'st-win'); win.setAttribute('role', 'dialog'); win.setAttribute('aria-modal', 'true'); win.setAttribute('aria-labelledby', 'stHistTitle');
  const winTitle = el('h3', '', '¿Seguro que quieres borrar tu historial?'); winTitle.id = 'stHistTitle';
  const winSub = el('p', 'st-win-sub');
  const winBtns = el('div', 'st-win-btns');
  const noBtn  = el('button', 'st-btn', 'No'); noBtn.type = 'button';
  const yesBtn = el('button', 'st-btn st-btn-danger', 'Sí, borrar todo'); yesBtn.type = 'button';
  winBtns.append(noBtn, yesBtn);
  const winHead = el('h4', '', 'O elige cuáles borrar');
  const histList = el('ul', 'st-hist');
  const histEmpty = el('div', 'st-hist-empty', 'No hay búsquedas guardadas.');
  win.append(winTitle, winSub, winBtns, winHead, histList, histEmpty);
  histModal.append(win);

  let histOpener = null, histBusy = false;
  const histIsOpen = () => histModal.classList.contains('open');

  function refreshHistInfo(msg){
    const n = readHistory().length;
    winSub.textContent = msg || (n ? `Tienes ${n} búsqueda${n === 1 ? '' : 's'} guardada${n === 1 ? '' : 's'}. Se eliminarán todas si eliges “Sí”.` : 'Tu historial está vacío.');
    yesBtn.disabled = !n || histBusy;
    winHead.hidden = histList.hidden = !n;
    histEmpty.hidden = !!n || !!msg;
    return n;
  }

  function collapse(li, delay){
    li.style.height = li.offsetHeight + 'px';
    void li.offsetHeight;
    if(delay) li.style.transitionDelay = delay + 'ms';
    li.classList.add('out');
    setTimeout(() => li.remove(), 380 + (delay || 0));
  }

  function renderHist(){
    histList.textContent = '';
    readHistory().forEach((it, i) => {
      const li = el('li', 'st-hist-item'); li.style.setProperty('--i', Math.min(i, 8));
      const img = el('img'); img.alt = ''; img.width = 20; img.height = 20;
      const eng = ENGINES[it.engine];
      if(eng) img.src = eng.icon;
      img.addEventListener('error', () => img.remove());
      const t = el('span', 'st-hist-q', it.q);
      const e = el('span', 'st-hist-e', eng ? eng.name : '');
      const del = el('button', 'st-hist-del'); del.type = 'button'; del.innerHTML = TRASH;
      del.setAttribute('aria-label', 'Borrar la búsqueda: ' + it.q);
      del.addEventListener('click', () => {
        if(histBusy) return;
        const items = readHistory();
        const idx = items.findIndex(x => x.q === it.q && x.engine === it.engine);
        if(idx >= 0){ items.splice(idx, 1); writeHistory(items); }
        collapse(li);
        // pasa el foco a la siguiente fila para poder seguir borrando con teclado
        const next = li.nextElementSibling || li.previousElementSibling;
        if(next){ const nb = next.querySelector('button'); if(nb) nb.focus(); } else noBtn.focus();
        setTimeout(() => refreshHistInfo(), 20);
      });
      li.append(img, t, e, del);
      histList.append(li);
    });
  }

  function openHistory(opener){
    histOpener = opener || null; histBusy = false;
    renderHist(); refreshHistInfo();
    histModal.classList.add('open'); histModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => noBtn.focus(), 60);
  }
  function closeHistory(){
    if(!histIsOpen()) return;
    histModal.classList.remove('open'); histModal.setAttribute('aria-hidden', 'true');
    if(histOpener && histOpener.focus) try{ histOpener.focus(); }catch(e){}
  }

  noBtn.addEventListener('click', closeHistory);
  histModal.addEventListener('pointerdown', e => { if(e.target === histModal) closeHistory(); });
  yesBtn.addEventListener('click', () => {
    if(histBusy) return;
    histBusy = true; yesBtn.disabled = true; noBtn.disabled = true;
    writeHistory([]); store.del('startpage_history');
    const b = $('clearHistory'); if(b) b.click();
    [...histList.children].slice(0, 8).forEach((li, i) => collapse(li, i * 45));
    [...histList.children].slice(8).forEach(li => li.remove());
    refreshHistInfo('Historial borrado.');
    winTitle.textContent = '¡Listo!';
    setTimeout(() => { closeHistory(); noBtn.disabled = false; winTitle.textContent = '¿Seguro que quieres borrar tu historial?'; histBusy = false; }, 1000);
  });
  // El foco se queda dentro de la ventana
  histModal.addEventListener('keydown', e => {
    if(e.key !== 'Tab') return;
    const f = [...win.querySelectorAll('button:not([disabled])')];
    if(!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });

  /* ---------- Documentos legales (se leen aquí mismo, en una ventana flotante) ---------- */
  const LEGAL_DATE = '4 de octubre de 2026';
  const LEGAL = {
    privacidad: { title: 'Política de privacidad', html: `
  <div class="st-doc-lead"><p><strong>En corto:</strong> AKON Search es una página de inicio personal y estática. No tiene cuentas, base de datos, anuncios ni analíticas, y su autor no recibe ningún dato tuyo. Lo que configuras se queda en tu navegador.</p></div>

  <h2>1. Quién la hace</h2>
  <p>AKON Search es un proyecto personal de Emiliano Hernández Navarrete (h3nix). No existe un servidor propio que reciba o procese información de quien la usa.</p>

  <h2>2. Qué se guarda en tu navegador</h2>
  <p>Para recordar tus preferencias, la página guarda datos <strong>solo en tu dispositivo</strong> (en el almacenamiento local del navegador). Nunca se envían al autor:</p>
  <ul>
    <li>El color de tema y el fondo de pantalla que elegiste, y si están activados.</li>
    <li>La imagen de fondo que subas tú: se guarda en la base de datos local del navegador y no sale de tu equipo.</li>
    <li>Tus accesos directos (dirección y nombre) y cuántas filas mostrar.</li>
    <li>Tus búsquedas recientes y el buscador predeterminado.</li>
    <li>La ubicación del clima y la última lectura recibida.</li>
  </ul>
  <p>Puedes borrar todo esto cuando quieras en <strong>Ajustes → Privacidad y datos</strong>, o limpiando los datos del sitio desde la configuración de tu navegador.</p>

  <h2>3. Qué se envía a otros sitios</h2>
  <p>Algunas funciones piden información a servicios de terceros. Tu navegador se conecta directamente a ellos, por lo que reciben datos técnicos normales, como tu dirección IP:</p>
  <div class="st-doc-tbl"><table>
    <tr><th>Servicio</th><th>Para qué</th><th>Qué recibe</th></tr>
    <tr><td>Google Fonts</td><td>Tipografías de la página</td><td>Tu IP y datos del navegador</td></tr>
    <tr><td>Open-Meteo</td><td>El clima</td><td>Las coordenadas del lugar mostrado (por defecto, Ciudad de México)</td></tr>
    <tr><td>Google, DuckDuckGo o Wikipedia</td><td>Sugerencias al escribir en la barra</td><td>El texto que escribes, según el buscador elegido</td></tr>
    <tr><td>Google (iconos)</td><td>Logos de tus accesos directos</td><td>El dominio de cada acceso directo</td></tr>
  </table></div>
  <ul>
    <li><strong>Tu ubicación</strong> solo se pide si haces clic en el clima y aceptas el permiso del navegador. Las coordenadas se redondean (unos 1 km) y se guardan únicamente en tu navegador.</li>
    <li><strong>Al buscar</strong>, se abre el sitio del buscador elegido en una pestaña nueva; desde ese momento aplica la política de ese sitio.</li>
    <li><strong>Los enlaces</strong> de la página llevan a sitios externos que tienen sus propias políticas.</li>
    <li>El autocompletado puede desactivarse por completo en el código (<code>AUTOCOMPLETE = false</code> en <code>script_pc.js</code>).</li>
  </ul>

  <h2>4. Cookies</h2>
  <p>La página no usa cookies de publicidad ni de analítica. Para recordar tu personalización pide tu permiso (aviso de cookies): si lo rechazas, no guarda nada. Consulta la <button type="button" class="st-doc-link" data-doc="cookies">política de cookies</button> para el detalle.</p>

  <h2>5. Seguridad</h2>
  <p>La página solo ejecuta su propio código, bloquea conexiones a sitios no previstos, abre únicamente direcciones http(s), no interpreta como código lo que escribes o guardas, y pide al navegador no enviar la página de origen al abrir enlaces.</p>

  <h2>6. Tu control</h2>
  <p>Puedes ver, cambiar o borrar tus datos en cualquier momento desde Ajustes, negar el permiso de ubicación, o dejar de usar la página sin que quede nada en ningún servidor del autor.</p>

  <h2>7. Cambios</h2>
  <p>Esta política puede actualizarse si cambian las funciones de la página. La fecha de arriba indica la última revisión.</p>` },

    cookies: { title: 'Política de cookies', html: `
  <div class="st-doc-lead"><p><strong>En corto:</strong> AKON Search no usa cookies de publicidad ni de analítica. Para recordar tus ajustes usa el almacenamiento local de tu navegador, solo si aceptas; si las rechazas, no se guarda nada.</p></div>

  <h2>1. Qué son las cookies</h2>
  <p>Las cookies son pequeños archivos que un sitio guarda en tu navegador para reconocerte o medir tu actividad. El almacenamiento local es parecido, pero sus datos no viajan a ningún servidor en cada visita.</p>

  <h2>2. Lo que usa esta página</h2>
  <p>Solo almacenamiento local (<code>localStorage</code> e <code>IndexedDB</code>), y únicamente si aceptas las cookies. Sirve para que tus preferencias no se pierdan al cerrar la pestaña. Puedes ver el detalle en <strong>Ajustes → Cookies</strong>:</p>
  <div class="st-doc-tbl"><table>
    <tr><th>Nombre</th><th>Para qué sirve</th></tr>
    <tr><td><code>startpage_consent</code></td><td>Tu elección sobre las cookies (se guarda siempre, para no preguntarte en cada visita)</td></tr>
    <tr><td><code>startpage_theme</code></td><td>Color de tema elegido</td></tr>
    <tr><td><code>startpage_mode</code></td><td>Modo claro u oscuro elegido</td></tr>
    <tr><td><code>startpage_background</code>, <code>startpage_bg_color</code>, <code>startpage_bg_enabled</code></td><td>Fondo de pantalla y si está activado</td></tr>
    <tr><td><code>startpage_hidden_sections</code>, <code>startpage_hide_all_sections</code></td><td>Qué secciones de la página principal tienes ocultas</td></tr>
    <tr><td><code>startpage_shortcuts</code>, <code>startpage_shortcuts_enabled</code>, <code>startpage_shortcuts_rows</code></td><td>Tus accesos directos y su aspecto</td></tr>
    <tr><td><code>startpage_history</code></td><td>Búsquedas recientes</td></tr>
    <tr><td><code>startpage_signature</code></td><td>Apodo o nombre del pie de página</td></tr>
    <tr><td><code>startpage_footer_text</code></td><td>Frase del pie de página que escribiste</td></tr>
    <tr><td><code>startpage_hidden_engines</code></td><td>Buscadores que ocultaste del menú</td></tr>
    <tr><td><code>startpage_default_engine</code></td><td>Buscador predeterminado</td></tr>
    <tr><td><code>startpage_timezone</code>, <code>startpage_tz_device</code>, <code>startpage_time_offset</code></td><td>País del reloj, si usas la hora del dispositivo y la hora manual</td></tr>
    <tr><td><code>startpage_weather_place</code>, <code>startpage_weather_cache</code></td><td>Lugar del clima y última lectura</td></tr>
    <tr><td><code>startpage</code> (IndexedDB)</td><td>Tu imagen de fondo subida</td></tr>
  </table></div>
  <p>Ninguno de estos datos se usa para publicidad, perfiles ni seguimiento.</p>

  <h2>3. Servicios de terceros</h2>
  <p>La página carga contenido de Google Fonts y Google (iconos), consulta a Open-Meteo y, si dejas activado el autocompletado, a Google, DuckDuckGo o Wikipedia. Esas conexiones las hace tu navegador, y esos servicios pueden aplicar sus propias cookies según sus políticas. Esta página no controla ni lee esas cookies.</p>

  <h2>4. Cómo borrarlo o bloquearlo</h2>
  <ul>
    <li>En <strong>Ajustes → Privacidad y datos</strong> puedes borrar el historial, los accesos directos o restablecer todos los ajustes.</li>
    <li>También puedes borrar los datos del sitio desde la configuración de tu navegador, o bloquear cookies de terceros.</li>
  </ul>
  <p>Si borras estos datos, la página sigue funcionando; solo vuelve a sus valores originales.</p>

  <h2>5. Más información</h2>
  <p>Lee también la <button type="button" class="st-doc-link" data-doc="privacidad">política de privacidad</button>.</p>` },

    terminos: { title: 'Términos de uso', html: `
  <div class="st-doc-lead"><p><strong>En corto:</strong> AKON Search es un proyecto personal que se ofrece tal cual, sin garantías. Al usarlo aceptas estos términos.</p></div>

  <h2>1. Qué es</h2>
  <p>AKON Search es una página de inicio personal creada por Emiliano Hernández Navarrete (h3nix): un buscador, accesos directos, reloj y clima, con ajustes que se guardan en tu navegador.</p>

  <h2>2. Uso permitido</h2>
  <p>Puedes usarla libremente para fines personales. Te pido no usarla para actividades ilegales ni para dañar a otras personas o sistemas.</p>

  <h2>3. Enlaces y herramientas de terceros</h2>
  <p>La página incluye enlaces a sitios y servicios ajenos, entre ellos redes sociales, asistentes de inteligencia artificial y herramientas de seguridad informática. No los controlo ni respondo por su contenido, disponibilidad o políticas.</p>
  <p>Las herramientas de seguridad se ofrecen con fines informativos y educativos. Tú eres responsable de usarlas de forma legal y solo en sistemas propios o con autorización expresa.</p>

  <h2>4. Información mostrada</h2>
  <p>El clima y las sugerencias de búsqueda vienen de servicios externos y pueden ser inexactos, incompletos o no estar disponibles. No los uses para decisiones importantes sin verificarlos.</p>

  <h2>5. Marcas y contenido de terceros</h2>
  <p>Los nombres, logos e iconos de otros servicios pertenecen a sus respectivos dueños y se muestran solo para identificar los enlaces.</p>

  <h2>6. Sin garantías</h2>
  <p>La página se ofrece «tal cual», sin garantía de que funcione sin errores o interrupciones. En la medida que permita la ley, el autor no se hace responsable de daños o pérdidas derivados de su uso, incluidos los datos que borres desde Ajustes.</p>

  <h2>7. Cambios</h2>
  <p>Estos términos y la página pueden cambiar en cualquier momento. La fecha de arriba indica la última revisión.</p>

  <h2>8. Ley aplicable</h2>
  <p>Estos términos se interpretan conforme a las leyes aplicables de México.</p>

  <h2>9. Más información</h2>
  <p>Consulta la <button type="button" class="st-doc-link" data-doc="privacidad">política de privacidad</button> y la <button type="button" class="st-doc-link" data-doc="cookies">política de cookies</button>.</p>` }
  };

  const docModal = el('div', 'st-modal'); docModal.setAttribute('aria-hidden', 'true');
  const docWin = el('div', 'st-win st-docwin'); docWin.setAttribute('role', 'dialog'); docWin.setAttribute('aria-modal', 'true'); docWin.setAttribute('aria-labelledby', 'stDocTitle');
  const docHead = el('div', 'st-doc-head');
  const docTitle = el('h3', '', ''); docTitle.id = 'stDocTitle';
  const docX = el('button', 'st-doc-x'); docX.type = 'button'; docX.setAttribute('aria-label', 'Cerrar');
  docX.innerHTML = svg('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>');
  docHead.append(docTitle, docX);
  const docMeta = el('p', 'st-doc-meta', 'AKON Search · Última actualización: ' + LEGAL_DATE);
  const docBody = el('div', 'st-doc-body'); docBody.tabIndex = 0;
  docWin.append(docHead, docMeta, docBody);
  docModal.append(docWin);

  let docOpener = null;
  const docIsOpen = () => docModal.classList.contains('open');
  // Al cambiar de documento: el actual sale deslizándose y el nuevo entra desde el lado contrario
  const DOC_ORDER = ['privacidad', 'cookies', 'terminos'];
  let docKey = null, docSwitching = false;
  function showDoc(key, animate){
    const d = LEGAL[key]; if(!d) return;
    const apply = () => {
      docTitle.textContent = d.title;
      docBody.innerHTML = d.html;               // texto fijo escrito arriba, no viene de ningún dato del usuario
      docBody.scrollTop = 0;
    };
    const still = !animate || !docKey || docKey === key || reducedMotion();
    const dir = DOC_ORDER.indexOf(key) > DOC_ORDER.indexOf(docKey) ? 1 : -1;
    docKey = key;
    if(still){ apply(); return; }
    docSwitching = true;
    const parts = [docTitle, docBody];
    const out = parts.map(n => n.animate(
      [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-dir * 44}px)` }],
      { duration: 190, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }));
    Promise.all(out.map(an => an.finished.catch(() => {}))).then(() => {
      apply();
      out.forEach(an => an.cancel());
      parts.forEach((n, i) => n.animate(
        [{ opacity: 0, transform: `translateX(${dir * 44}px)` }, { opacity: 1, transform: 'translateX(0)' }],
        { duration: 440, delay: i * 50, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
      docSwitching = false;
    });
  }
  function openDoc(key, opener){
    docOpener = opener || null;
    docKey = null;
    showDoc(key);
    docModal.classList.add('open'); docModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => docX.focus(), 60);
  }
  function closeDoc(){
    if(!docIsOpen()) return;
    docModal.classList.remove('open'); docModal.setAttribute('aria-hidden', 'true');
    if(docOpener && docOpener.focus) try{ docOpener.focus(); }catch(e){}
  }
  docX.addEventListener('click', closeDoc);
  docModal.addEventListener('pointerdown', e => { if(e.target === docModal) closeDoc(); });
  docBody.addEventListener('click', e => {      // enlaces entre documentos
    const a = e.target.closest && e.target.closest('[data-doc]');
    if(a){ e.preventDefault(); if(docSwitching) return; showDoc(a.dataset.doc, true); docBody.focus(); }
  });
  docModal.addEventListener('keydown', e => {
    if(e.key !== 'Tab') return;
    const f = [...docWin.querySelectorAll('button, [tabindex="0"]')];
    const first = f[0], last = f[f.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });

  /* ---------- Secciones de la página principal: mostrar / ocultar una por una ---------- */
  const SEC_KEY = 'startpage_hidden_sections';
  const pageSecs = [...document.querySelectorAll('main > section')].map(node => {
    const h = node.querySelector('h2');
    const name = h ? h.textContent.trim() : '';
    const id = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return { node, name, id };
  }).filter(x => x.name && x.id);
  const readHiddenSecs = () => {
    try{ const a = JSON.parse(localStorage.getItem(SEC_KEY) || '[]'); return Array.isArray(a) ? a.filter(v => typeof v === 'string') : []; }
    catch(e){ return []; }
  };
  const writeHiddenSecs = a => { try{ localStorage.setItem(SEC_KEY, JSON.stringify(a)); }catch(e){} };
  function showSec(x, visible, animate){
    const n = x.node;
    if(!animate){ n.classList.toggle('sec-hidden', !visible); return; }
    const calm = document.documentElement.classList.contains('reduce-motion') ||
                 (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if(calm){ n.classList.toggle('sec-hidden', !visible); return; }
    if(visible){
      n.classList.remove('sec-hidden');
      n.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.22,1,.36,1)' });
    }else{
      const an = n.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
      an.finished.then(() => { n.classList.add('sec-hidden'); an.cancel(); }).catch(() => {});
    }
  }
  // Interruptor maestro: oculta todas las secciones de una vez y apaga los interruptores individuales
  const ALL_KEY = 'startpage_hide_all_sections';
  const allHidden = () => { try{ return localStorage.getItem(ALL_KEY) === '1'; }catch(e){ return false; } };
  const secVisible = x => !allHidden() && !readHiddenSecs().includes(x.id);
  const secCtls = [];     // { row, cb } de cada interruptor individual
  function refreshSecCtls(){
    const off = allHidden();
    secCtls.forEach(({ row: r, cb }) => {
      cb.checked = !off && !readHiddenSecs().includes(cb.dataset.sec);
      cb.disabled = off;
      r.classList.toggle('st-off', off);
    });
  }
  pageSecs.forEach(x => showSec(x, secVisible(x), false));
  function sectionRow(x){
    const wrap = el('label', 'st-switch');
    const cb = el('input'); cb.type = 'checkbox'; cb.dataset.sec = x.id;
    cb.setAttribute('aria-label', 'Mostrar ' + x.name);
    wrap.append(cb, el('span'));
    cb.addEventListener('change', () => {
      if(allHidden()){ cb.checked = false; return; }
      const hid = readHiddenSecs().filter(v => v !== x.id);
      if(!cb.checked) hid.push(x.id);
      writeHiddenSecs(hid);
      showSec(x, cb.checked, true);
    });
    const r = row(x.name, 'Muestra u oculta esta sección en la página principal.', wrap);
    r.dataset.q += ' secciones ocultar mostrar página principal inicio';
    secCtls.push({ row: r, cb });
    refreshSecCtls();
    return r;
  }
  function hideAllRow(){
    const wrap = el('label', 'st-switch');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = allHidden();
    cb.setAttribute('aria-label', 'Ocultar todas las secciones');
    wrap.append(cb, el('span'));
    cb.addEventListener('change', () => {
      try{ if(cb.checked) localStorage.setItem(ALL_KEY, '1'); else localStorage.removeItem(ALL_KEY); }catch(e){}
      refreshSecCtls();
      pageSecs.forEach(x => showSec(x, secVisible(x), true));
    });
    syncs.push(() => { cb.checked = allHidden(); refreshSecCtls(); });
    const r = row('Ocultar todas las secciones', 'Oculta todo de una vez y apaga los interruptores de abajo. Al desactivarlo, vuelve lo que tenías elegido.', wrap);
    r.dataset.q += ' ocultar todo todas secciones página principal limpia';
    return r;
  }

  // Archivos de la página: apagar CSS o JavaScript (Ctrl + A los activa todos otra vez)
  function fileOffRow(label, desc, key, tags){
    const wrap = el('label', 'st-switch');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = !offActive(key);
    cb.setAttribute('aria-label', label);
    wrap.append(cb, el('span'));
    cb.addEventListener('change', () => {
      if(!cb.checked && hasPageLock()){
        cb.checked = true;
        showSettingsWarning('Quita la contraseña (Privacidad y datos) para desactivar archivos.');
        return;
      }
      try{ if(cb.checked) sessionStorage.removeItem(key); else sessionStorage.setItem(key, '1'); }catch(e){}
      if(key === OFF_JS_KEY){ if(!cb.checked) setTimeout(() => location.reload(), 350); return; }   // sin JS la página se recarga ya apagado
      setStylesDisabled(!cb.checked);
      updateOffHint();
    });
    syncs.push(() => { cb.checked = !offActive(key); });
    const r = row(label, desc, wrap);
    r.dataset.q += ' ' + tags + ' archivos desactivar activar apagar ctrl a';
    return r;
  }

  // Dispositivo: qué detectó la pantalla de inicio (computadora o móvil) y cómo corregirlo
  const DVC_ICON = {
    pc:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"></rect><line x1="8" y1="20" x2="16" y2="20"></line><line x1="12" y1="16" x2="12" y2="20"></line></svg>',
    mobile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"></rect><line x1="11" y1="18" x2="13" y2="18"></line></svg>'
  };
  const dvcChip = el('span', 'st-chip');
  function refreshDeviceChip(){
    const d = currentDevice || applyDevice();
    dvcChip.innerHTML = DVC_ICON[d.mobile ? 'mobile' : 'pc'];
    dvcChip.append(el('span', '', deviceName(d) + ' · ' + d.how));
  }
  refreshDeviceChip();
  syncs.push(refreshDeviceChip);
  const dvcStatusRow = row('Estás usando', 'Esto es lo que detectó la pantalla de carga. Si no es correcto, cámbialo en “Cómo detectarlo”.', dvcChip);
  dvcStatusRow.dataset.q += ' dispositivo detectado computadora pc móvil celular teléfono';

  const dvcCtl = document.createElement('select'); dvcCtl.id = 'dvcCtl'; dvcCtl.hidden = true;
  DEVICE_MODES.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; dvcCtl.append(o); });
  document.body.append(dvcCtl);
  dvcCtl.value = deviceMode();
  dvcCtl.addEventListener('change', () => {
    const wasMobile = (currentDevice || applyDevice()).mobile;
    try{ localStorage.setItem(DEVICE_KEY, dvcCtl.value); }catch(e){}
    if(detectDevice().mobile !== wasMobile){
      // Cambia de computadora a móvil (o al revés): se recarga para cargar el script y los estilos que tocan
      try{ sessionStorage.setItem(SKIP_INTRO_KEY, '1'); }catch(e){}
      location.reload();
      return;
    }
    applyDevice();
    refreshDeviceChip();
    placeBgGrid();
  });
  syncs.push(() => { dvcCtl.value = deviceMode(); });
  const dvcRow = linkedSelect('Cómo detectarlo',
    'Automático usa el User-Agent del navegador y el tamaño de la pantalla (si cualquiera dice móvil, es móvil). También puedes usar solo uno de los dos, o elegir tú el dispositivo.',
    'dvcCtl', DEVICE_MODES);
  dvcRow.dataset.q += ' dispositivo detectar user-agent useragent tamaño pantalla móvil computadora pc corregir';

  /* ---------- Contenido ---------- */
  const sections = [];

  // Inicio
  // Mensaje de bienvenida: AKON Search como buscador principal
  const hero = el('div', 'st-hero');
  const heroLogo = el('img', 'st-hero-logo'); heroLogo.alt = ''; heroLogo.src = 'images/Logo.png'; heroLogo.width = 104; heroLogo.height = 100;
  heroLogo.addEventListener('error', () => heroLogo.remove());
  const heroHeart = el('span', 'st-hero-heart'); heroHeart.setAttribute('aria-hidden', 'true');
  heroHeart.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.5 2.6 5 6 5c2.1 0 3.4 1.1 4.2 2.3h3.6C14.6 6.1 15.9 5 18 5c3.4 0 5.1 3.5 3.6 6.8C19.5 16.4 12 21 12 21z"/></svg>';
  const heroText = el('div', 'st-hero-text');
  heroText.append(el('strong', '', 'Gracias por elegir AKON Search como tu buscador principal.'),
                  el('span', '', 'Una experiencia de búsqueda rápida y a tu medida.'));
  hero.append(heroLogo, heroHeart, heroText);

  // Celular: los fondos de pantalla se eligen aquí mismo (en el celular no existe el botón "Personalizar").
  // La cuadrícula del panel se traslada a esta tarjeta mientras el dispositivo es móvil y vuelve al panel en computadora.
  const bgWrap = el('div', 'st-bgwrap');
  const bgOrigin = { parent: bgGrid.parentNode, next: bgGrid.nextSibling };
  function placeBgGrid(){
    const mobile = document.documentElement.dataset.device === 'mobile';
    if(mobile && bgGrid.parentNode !== bgWrap) bgWrap.append(bgGrid);
    else if(!mobile && bgGrid.parentNode === bgWrap) bgOrigin.parent.insertBefore(bgGrid, bgOrigin.next);
  }
  placeBgGrid();

  sections.push({ id: 'inicio', label: 'Inicio', icon: ICON.home, cards: [
    card('Buscador principal', null, hero),
    card('Página de inicio', null,
      linkedSwitch('Fondos de pantalla', 'Muestra la imagen o color de fondo elegido.', 'bgToggle'),
      bgWrap,                                   // solo se ve en el celular: aquí se elige el fondo
      linkedSwitch('Accesos directos', 'Muestra los accesos que agregaste con el botón “+”.', 'scToggle'),
      linkedSelect('Filas de accesos directos', 'Cuántas filas se ven antes de ocultar el resto.', 'scRows',
        [['1', '1'], ['2', '2'], ['3', '3'], ['99', 'Todas']]))
  ]});

  // Buscar
  const engineBox = el('div', 'st-opts');
  engineBox.setAttribute('role', 'radiogroup');
  engineBox.setAttribute('aria-label', 'Buscador predeterminado');
  const engineBtns = [];
  const pick = el('span', 'st-pick nt'); pick.setAttribute('aria-hidden', 'true');
  engineBox.append(pick);
  const CHECK = '<svg class="st-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5 12.5 10 17.5 19 7.5"/></svg>';
  try{
    for(const [key, eng] of Object.entries(ENGINES)){
      const b = el('button', 'st-opt'); b.type = 'button'; b.dataset.engine = key;
      b.setAttribute('role', 'radio');
      const img = el('img'); img.alt = ''; img.src = eng.icon; img.width = 22; img.height = 22;
      img.addEventListener('error', () => img.remove());
      b.append(img, document.createTextNode(eng.name));
      b.insertAdjacentHTML('beforeend', CHECK);
      b.addEventListener('click', () => {
        try{ localStorage.setItem(ENGINE_KEY, key); }catch(e){}
        try{ setEngine(key); }catch(e){}
        b.focus(); markEngine(true);
        b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      });
      engineBox.append(b); engineBtns.push(b);
    }
  }catch(e){}
  const markEngine = animate => {
    let cur = store.get(ENGINE_KEY);
    if(!cur || !(typeof ENGINES !== 'undefined' && ENGINES[cur])) cur = typeof DEFAULT_ENGINE !== 'undefined' ? DEFAULT_ENGINE : 'google';
    let target = null;
    engineBtns.forEach(b => {
      const on = b.dataset.engine === cur;
      b.setAttribute('aria-checked', String(on));
      if(on) target = b;
    });
    if(!target || !target.offsetWidth) return;          // la sección está oculta: se acomoda al mostrarse
    const go = animate === true;
    if(!go) pick.classList.add('nt');
    pick.style.width  = target.offsetWidth + 'px';
    pick.style.height = target.offsetHeight + 'px';
    pick.style.transform = `translate(${target.offsetLeft}px, ${target.offsetTop}px)`;
    if(go){ pick.classList.remove('pulse'); void pick.offsetWidth; pick.classList.add('pulse'); }
    else{ void pick.offsetWidth; pick.classList.remove('nt'); }
  };
  if(window.ResizeObserver) new ResizeObserver(() => markEngine(false)).observe(engineBox);   // reubica el marcador al mostrar la sección o cambiar el tamaño
  syncs.push(markEngine);
  const engineRow = el('div', 'st-row'); engineRow.dataset.q = 'buscador predeterminado google bing duckduckgo ebay perplexity wikipedia shodan';
  engineRow.style.display = 'block'; engineRow.append(engineBox); rows.push(engineRow);

  // Buscadores visibles: un interruptor por buscador (siempre queda al menos uno)
  const engSwitches = [];
  const engRows = Object.entries(ENGINES).map(([key, eng]) => {
    const wrap = el('label', 'st-switch');
    const cb = el('input'); cb.type = 'checkbox'; cb.dataset.engine = key;
    cb.setAttribute('aria-label', 'Mostrar ' + eng.name);
    wrap.append(cb, el('span'));
    const r = row(eng.name, null, wrap);
    r.dataset.q += ' buscador buscadores ocultar mostrar menú';
    engSwitches.push({ row: r, cb });
    cb.addEventListener('change', () => {
      const hid = hiddenEngines().filter(k => k !== key);
      if(!cb.checked) hid.push(key);
      if(hid.length >= Object.keys(ENGINES).length){ cb.checked = true; return; }
      try{ localStorage.setItem(HIDDEN_ENGINES_KEY, JSON.stringify(hid)); }catch(e){}
      applyEngineVisibility();
      // Si el predeterminado quedó oculto, el que quedó activo pasa a ser el predeterminado
      if(hid.includes(store.get(ENGINE_KEY))){ try{ localStorage.setItem(ENGINE_KEY, currentEngine); }catch(e){} }
      paintEngineVis();
    });
    return r;
  });
  function paintEngineVis(){
    const hid = hiddenEngines();
    const visible = Object.keys(ENGINES).length - hid.length;
    engSwitches.forEach(({ row: r, cb }) => {
      const on = !hid.includes(cb.dataset.engine);
      cb.checked = on;
      cb.disabled = on && visible <= 1;      // el último visible no se puede apagar
      r.classList.toggle('st-off', cb.disabled);
    });
    engineBtns.forEach(b => { b.style.display = hid.includes(b.dataset.engine) ? 'none' : ''; });
    markEngine(false);
  }
  paintEngineVis();
  syncs.push(paintEngineVis);

  sections.push({ id: 'buscar', label: 'Buscar', icon: ICON.search, cards: [
    card('Buscador predeterminado', 'Es el que se usa al abrir la página.', engineRow),
    card('Buscadores en el menú', 'Apaga los que no uses para ocultarlos del menú de la barra de búsqueda. Siempre debe quedar al menos uno.', ...engRows),
    card('Búsquedas recientes', null,
      historyRow('Historial de búsquedas', 'Revisa tus búsquedas recientes y borra todas o solo las que quieras.'))
  ]});

  // Apariencia
  const themeBox = el('div', 'st-themes');
  themeBox.setAttribute('role', 'radiogroup'); themeBox.setAttribute('aria-label', 'Color de contornos');
  const themeBtns = [];
  try{
    for(const t of THEMES){
      const b = el('button', 'st-theme' + (t.color ? '' : ' none')); b.type = 'button'; b.dataset.id = t.id;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', t.id === 'default' ? 'Sin color' : t.id);
      if(t.color) b.style.setProperty('--c', t.color);
      b.addEventListener('click', () => { setTheme(t.id); markTheme(true); });
      themeBox.append(b); themeBtns.push(b);
    }
  }catch(e){}
  const markTheme = animate => {
    const cur = store.get('startpage_theme') || 'default';
    themeBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.id === cur)));
    markWheel(animate === true);
  };
  syncs.push(markTheme);
  const themeRow = el('div', 'st-row'); themeRow.dataset.q = 'tema color contornos apariencia'; themeRow.style.display = 'block';
  themeRow.append(themeBox); rows.push(themeRow);


  /* ---------- Color del tema: lectura y utilidades ---------- */
  // El tema vigente lo escribe script_pc.js en <html style="--theme-color:...">; se lee de ahí (no del estilo calculado, que va en plena animación)
  function themeColor(){
    try{
      const v = document.documentElement.style.getPropertyValue('--theme-color').trim();
      return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '';
    }catch(e){ return ''; }
  }
  const lum = hex => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4));
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  };
  const blend = (hex, to, t) => '#' + [1, 3, 5].map(i =>
    Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + parseInt(to.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');

  /* ---------- Rueda de colores: 36 tonos x 5 anillos = 180 colores ---------- */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, cls) => {
    const n = document.createElementNS(SVGNS, tag);
    for(const k in attrs) n.setAttribute(k, attrs[k]);
    if(cls) n.setAttribute('class', cls);
    return n;
  };
  const hslHex = (h, s, l) => {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  };
  const W_HUES = 36, W_LIGHT = [82, 70, 58, 46, 34], W_R0 = 46, W_R1 = 144, W_STEP = (W_R1 - W_R0) / W_LIGHT.length;
  const sector = (a0, a1, ra, rb) => {
    const p = (a, r) => { const t = (a - 90) * Math.PI / 180; return [150 + r * Math.cos(t), 150 + r * Math.sin(t)].map(v => v.toFixed(2)); };
    const [x0, y0] = p(a0, rb), [x1, y1] = p(a1, rb), [x2, y2] = p(a1, ra), [x3, y3] = p(a0, ra);
    return `M${x0} ${y0}A${rb} ${rb} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${ra} ${ra} 0 0 0 ${x3} ${y3}Z`;
  };
  const wheel = sv('svg', { viewBox: '0 0 300 300', role: 'radiogroup', 'aria-label': 'Rueda de colores' }, 'st-wheel');
  const segs = [];
  W_LIGHT.forEach((l, ring) => {
    segs[ring] = [];
    for(let h = 0; h < W_HUES; h++){
      const hex = hslHex(h * 10, 82, l);
      const p = sv('path', {
        d: sector(h * 10, h * 10 + 10, W_R0 + ring * W_STEP, W_R0 + (ring + 1) * W_STEP),
        fill: hex, role: 'radio', tabindex: '-1', 'aria-checked': 'false', 'aria-label': hex.toUpperCase()
      }, 'st-seg');
      p.dataset.hex = hex; p.dataset.ring = ring; p.dataset.hue = h;
      segs[ring][h] = p; wheel.append(p);
    }
  });
  const hoverMark = sv('path', { d: '' }, 'st-mark hover');
  const selMark   = sv('path', { d: '' }, 'st-mark sel');
  const hub       = sv('circle', { cx: 150, cy: 150, r: W_R0 - 6 }, 'st-hub');
  const hubText   = sv('text', { x: 150, y: 154, 'text-anchor': 'middle' }, 'st-hub-t');
  wheel.append(hoverMark, selMark, hub, hubText);

  const hubLabel = () => { const c = themeColor(); return c ? c.toUpperCase() : 'NORMAL'; };
  const showHover = p => { hoverMark.setAttribute('d', p.getAttribute('d')); hoverMark.classList.add('on'); hubText.textContent = p.dataset.hex.toUpperCase(); };
  const hideHover = () => { hoverMark.classList.remove('on'); hubText.textContent = hubLabel(); };
  const pickSeg = p => { try{ setTheme('custom:' + p.dataset.hex); }catch(e){} markTheme(true); };
  const focusSeg = p => { segs.flat().forEach(x => x.setAttribute('tabindex', '-1')); p.setAttribute('tabindex', '0'); p.focus(); };

  wheel.addEventListener('pointerover', e => { const p = e.target.closest && e.target.closest('.st-seg'); if(p) showHover(p); });
  wheel.addEventListener('pointerleave', hideHover);
  wheel.addEventListener('focusin',  e => { if(e.target.classList && e.target.classList.contains('st-seg')) showHover(e.target); });
  wheel.addEventListener('focusout', hideHover);
  wheel.addEventListener('click', e => { const p = e.target.closest && e.target.closest('.st-seg'); if(p) pickSeg(p); });
  wheel.addEventListener('keydown', e => {
    const p = e.target;
    if(!p.classList || !p.classList.contains('st-seg')) return;
    let r = +p.dataset.ring, h = +p.dataset.hue;
    if(e.key === 'ArrowRight') h = (h + 1) % W_HUES;
    else if(e.key === 'ArrowLeft') h = (h + W_HUES - 1) % W_HUES;
    else if(e.key === 'ArrowUp') r = Math.max(0, r - 1);
    else if(e.key === 'ArrowDown') r = Math.min(W_LIGHT.length - 1, r + 1);
    else if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pickSeg(p); return; }
    else return;
    e.preventDefault(); focusSeg(segs[r][h]);
  });

  function markWheel(animate){
    const cur = store.get('startpage_theme') || '';
    const hex = cur.startsWith('custom:') ? cur.slice(7).toLowerCase() : '';
    let sel = null;
    segs.forEach(r => r.forEach(x => {
      const on = !!hex && x.dataset.hex === hex;
      x.setAttribute('aria-checked', String(on));
      if(on) sel = x;
    }));
    if(!wheel.contains(document.activeElement)){
      segs.flat().forEach(x => x.setAttribute('tabindex', '-1'));
      (sel || segs[2][0]).setAttribute('tabindex', '0');
    }
    if(sel){
      selMark.setAttribute('d', sel.getAttribute('d'));
      selMark.classList.add('on');
      if(animate){ selMark.classList.remove('pop'); void selMark.getBoundingClientRect(); selMark.classList.add('pop'); }
    }else selMark.classList.remove('on');
    hubText.textContent = hubLabel();
  }

  const wheelWrap = el('div', 'st-wheel-wrap'); wheelWrap.append(wheel);
  const wheelRow = el('div', 'st-row'); wheelRow.dataset.q = 'rueda de colores círculo paleta color personalizado apariencia tono';
  wheelRow.style.display = 'block'; wheelRow.append(wheelWrap); rows.push(wheelRow);

  // Interruptor de animaciones
  const motionSwitch = el('label', 'st-switch');
  const motionCb = el('input'); motionCb.type = 'checkbox';
  motionSwitch.append(motionCb, el('span'));
  const syncMotionUI = () => { motionCb.checked = reducedMotion(); };   // sin elección propia refleja al sistema
  syncMotionUI();
  motionCb.addEventListener('change', () => {
    try{ localStorage.setItem(MOTION_KEY, motionCb.checked ? 'true' : 'false'); }catch(e){}
    window.dispatchEvent(new CustomEvent('akon-motion-change'));
    motionCb.blur();
  });
  const sysMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  sysMotion.addEventListener?.('change', () => {
    if(motionPref() === null){ applyMotionPref(); syncMotionUI(); }
  });
  syncs.push(syncMotionUI);
  const motionRow = row('Reducir animaciones', 'Desactiva los efectos de movimiento, los fundidos y los desenfoques. Consume menos batería y recursos.', motionSwitch);
  motionRow.dataset.q += ' movimiento transiciones efectos rendimiento batería desenfoque';

  // Memoria que ocupa la página: datos guardados, imagen subida y memoria RAM de la pestaña
  const fmtBytes = n => n < 1024 ? n + ' B'
    : n < 1048576 ? (n / 1024).toFixed(1) + ' KB'
    : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB'
    : (n / 1073741824).toFixed(2) + ' GB';
  const memSaved = el('div', 'st-ck-val');
  const memImg   = el('div', 'st-ck-val');
  const memRam   = el('div', 'st-ck-val');
  const memTag = 'memoria almacenamiento espacio ram datos guardados imagen rendimiento';
  const memRows = [
    row('Datos guardados', 'Ajustes, historial, accesos directos y clima.', memSaved),
    row('Imagen de fondo subida', 'Tu imagen propia, si elegiste una.', memImg),
    row('Memoria en uso (RAM)', 'Lo que gasta esta pestaña ahora mismo.', memRam)
  ];
  memRows.forEach(r => { r.dataset.q += ' ' + memTag; });

  function refreshRam(){
    const m = performance.memory;   // solo existe en navegadores basados en Chromium
    memRam.textContent = m && m.usedJSHeapSize ? '≈ ' + fmtBytes(m.usedJSHeapSize) : 'No disponible en este navegador';
  }
  async function refreshMem(){
    let saved = 0;
    try{ saved = window.AKON_CONSENT ? AKON_CONSENT.usage() : 0; }catch(e){}
    const session = window.AKON_CONSENT && !AKON_CONSENT.accepted();
    memSaved.textContent = fmtBytes(saved) + (session ? ' · solo esta sesión' : '');
    let img = 0;
    try{ const b = await idbGet('custom_bg'); img = b && b.size ? b.size : 0; }catch(e){}
    memImg.textContent = img ? fmtBytes(img) + (session ? ' · solo esta sesión' : '') : 'Ninguna';
    refreshRam();
  }
  refreshMem();
  syncs.push(refreshMem);
  document.addEventListener('akon-consent', refreshMem);
  // La RAM cambia sola: se actualiza cada 2 s, pero solo mientras Ajustes está a la vista
  setInterval(() => { if(memRam.offsetParent !== null) refreshRam(); }, 2000);

  // Interruptor claro/oscuro (el mismo botón del panel Personalizar, sincronizado con él)
  const modeSwitch = el('label', 'mode-switch');
  modeSwitch.innerHTML = '<input type="checkbox" role="switch" aria-label="Modo oscuro"><span class="ms-track"></span>'
    + '<span class="ms-knob"><span class="ms-disc">'
    + '<svg class="ms-icon ms-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" stroke="none"></circle><path d="M12 2.6v2.4M12 19v2.4M2.6 12H5M19 12h2.4M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M5.4 18.6l1.7-1.7M16.9 7.1l1.7-1.7" fill="none"></path></svg>'
    + '<svg class="ms-icon ms-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"></path></svg>'
    + '</span></span>';
  const modeCb = modeSwitch.querySelector('input');
  modeCb.checked = document.documentElement.dataset.mode === 'dark';
  modeCb.addEventListener('change', () => setMode(modeCb.checked ? 'dark' : 'light', modeSwitch));
  syncs.push(() => { modeCb.checked = document.documentElement.dataset.mode === 'dark'; });
  const modeRow = row('Modo claro / oscuro', 'Cambia el aspecto de toda la página. Si no eliges, se usa el del sistema.', modeSwitch);
  modeRow.dataset.q += ' modo claro oscuro noche día tema apariencia';

  // Frase del pie de página (se edita aquí y se ve al final de la página principal)
  const FOOT_KEY = 'startpage_footer_text';
  const FOOT_DEFAULT = 'El buen trabajo empieza con calma.';
  const footEl = document.querySelector('footer > span:first-child');
  const readFoot = () => { const v = store.get(FOOT_KEY); return v === null ? FOOT_DEFAULT : cleanText(v, 200); };
  const applyFoot = () => { if(footEl) footEl.textContent = readFoot(); };
  applyFoot();
  const footInput = el('input', 'st-input st-wide'); footInput.type = 'text'; footInput.maxLength = 200;
  footInput.placeholder = FOOT_DEFAULT; footInput.autocomplete = 'off'; footInput.spellcheck = false;
  footInput.setAttribute('aria-label', 'Frase del pie de página');
  const footCount = el('span', 'st-count');
  const footReset = el('button', 'st-btn', 'Restablecer frase'); footReset.type = 'button';
  const footFoot = el('div', 'st-time-foot'); footFoot.append(footReset, footCount);
  const footRow = el('div', 'st-row st-time'); footRow.append(footInput, footFoot);
  footRow.dataset.q = 'frase pie de página texto footer mensaje final apariencia cambiar';
  rows.push(footRow);
  const paintFoot = () => {
    footInput.value = readFoot();
    footCount.textContent = footInput.value.length + '/200';
    footReset.disabled = footInput.value === FOOT_DEFAULT;
  };
  footInput.addEventListener('input', () => {
    const v = cleanText(footInput.value, 200);
    try{ localStorage.setItem(FOOT_KEY, v); }catch(e){}   // vacío = sin frase
    applyFoot();
    footCount.textContent = footInput.value.length + '/200';
    footReset.disabled = v === FOOT_DEFAULT;
  });
  footReset.addEventListener('click', () => { store.del(FOOT_KEY); applyFoot(); paintFoot(); });
  paintFoot();
  syncs.push(paintFoot);

  // Apodo o nombre del pie de página (la firma de la derecha, "h3nix" por defecto)
  const SIG_KEY = 'startpage_signature';
  const SIG_DEFAULT = 'h3nix';
  const SIG_MAX = 50;
  const sigEl = document.querySelector('footer .signature');
  const readSig = () => { const v = store.get(SIG_KEY); return v === null ? SIG_DEFAULT : cleanText(v, SIG_MAX); };
  const applySig = () => { if(sigEl) sigEl.textContent = readSig(); };
  applySig();
  const sigInput = el('input', 'st-input st-wide'); sigInput.type = 'text'; sigInput.maxLength = SIG_MAX;
  sigInput.placeholder = SIG_DEFAULT; sigInput.autocomplete = 'off'; sigInput.spellcheck = false;
  sigInput.setAttribute('aria-label', 'Apodo o nombre');
  const sigCount = el('span', 'st-count');
  const sigReset = el('button', 'st-btn', 'Restablecer nombre'); sigReset.type = 'button';
  const sigFoot = el('div', 'st-time-foot'); sigFoot.append(sigReset, sigCount);
  const sigRow = el('div', 'st-row st-time'); sigRow.append(sigInput, sigFoot);
  sigRow.dataset.q = 'apodo nombre firma pie de página footer h3nix alias usuario apariencia cambiar';
  rows.push(sigRow);
  const paintSig = () => {
    sigInput.value = readSig();
    sigCount.textContent = sigInput.value.length + '/' + SIG_MAX;
    sigReset.disabled = sigInput.value === SIG_DEFAULT;
  };
  sigInput.addEventListener('input', () => {
    const v = cleanText(sigInput.value, SIG_MAX);
    try{ localStorage.setItem(SIG_KEY, v); }catch(e){}
    applySig();
    sigCount.textContent = sigInput.value.length + '/' + SIG_MAX;
    sigReset.disabled = v === SIG_DEFAULT;
  });
  sigReset.addEventListener('click', () => { store.del(SIG_KEY); applySig(); paintSig(); });
  paintSig();
  syncs.push(paintSig);

  sections.push({ id: 'apariencia', label: 'Apariencia', icon: ICON.look, cards: [
    card('Modo claro / oscuro', null, modeRow),
    pcOnly(card('Frase del pie de página', 'El texto que aparece al final de la página principal. Déjalo vacío si no quieres ninguna frase.', footRow)),
    pcOnly(card('Apodo o nombre', 'La firma que aparece a la derecha del pie de página (por defecto, h3nix).', sigRow)),
    card('Color de contornos', 'Pinta los bordes de las tarjetas, el buscador y el historial, y también los botones y contornos de estos ajustes.', themeRow),
    ...(pageSecs.length ? [pcOnly(card('Ocultar todo', 'Un solo botón para dejar la página principal sin secciones.', hideAllRow()))] : []),
    ...(pageSecs.length ? [pcOnly(card('Secciones de la página principal', 'Elige cuáles secciones quieres ver. Las que apagues se ocultan sin borrarse. Se desactivan mientras “Ocultar todo” esté encendido.', ...pageSecs.map(sectionRow)))] : []),
    pcOnly(card('Rueda de colores', 'Elige entre 180 colores: cada anillo es más oscuro que el anterior.', wheelRow)),
    pcOnly(card('Movimiento y memoria', 'Menos efectos = menos trabajo para tu equipo. Abajo ves lo que ocupa la página.', motionRow, ...memRows)),
    card('Dispositivo', 'AKON Search comprueba en la pantalla de carga si usas una computadora o un móvil. Si se equivoca, corrígelo aquí.', dvcStatusRow, dvcRow),
    pcOnly(card('Archivos de la página', 'Apaga el CSS o el JavaScript para ver la página sin ellos. Pulsa Ctrl + A para volver a activar todos los archivos. Se reactivan solos al cerrar la pestaña.',
      fileOffRow('CSS (estilos)', 'El diseño de la página: colores, tamaños y animaciones. Apagado, todo se ve sin diseño.', OFF_CSS_KEY, 'css estilos diseño style_pc.css style_mov.css'),
      fileOffRow('JavaScript', 'Lo que hace funcionar la página: reloj, clima, buscador y estos ajustes. Al apagarlo, la página se recarga sin ellos.', OFF_JS_KEY, 'js javascript script_pc.js script_mov.js')))
  ]});

  // Selector de estado (usa una lista oculta como puente con el selector animado)
  const wxCtl = document.createElement('select'); wxCtl.id = 'wxState'; wxCtl.hidden = true;
  const wxOptions = [['geo', 'Mi ubicación (GPS)'], ...MX_STATES.map(x => [x[0], x[1]])];
  wxOptions.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; wxCtl.append(o); });
  document.body.append(wxCtl);
  wxCtl.value = weatherCurrentChoice();
  wxCtl.addEventListener('change', () => { if(wxCtl.value === 'geo') useMyLocation(); else weatherPickState(wxCtl.value); });
  syncs.push(() => { wxCtl.value = weatherCurrentChoice(); });      // va antes que la del selector para que lea el valor al día
  const stateRow = linkedSelect('Estado', 'Cambia el lugar del clima.', 'wxState', wxOptions);
  stateRow.querySelector('.st-dd').classList.add('st-dd-tall');
  stateRow.dataset.q += ' estado clima ciudad república mexicana ubicación gps';

  // Hora: dispositivo / país / hora manual
  const tzCtl = document.createElement('select'); tzCtl.id = 'tzCtl'; tzCtl.hidden = true;
  const tzOptions = TIMEZONES.map(z => [z[0], z[1]]);
  tzOptions.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; tzCtl.append(o); });
  document.body.append(tzCtl);
  tzCtl.value = clockTZChoice();
  tzCtl.addEventListener('change', () => setClockTZ(tzCtl.value));
  const tzRow = linkedSelect('País', 'América del Sur, del Norte, Central y el Caribe. Los países con varias zonas tienen una opción por zona.', 'tzCtl', tzOptions);
  tzRow.querySelector('.st-dd').classList.add('st-dd-tall');
  tzRow.dataset.q += ' hora reloj zona horaria país argentina bolivia brasil chile colombia ecuador guyana paraguay perú surinam uruguay venezuela canadá estados unidos méxico belice costa rica el salvador guatemala honduras nicaragua panamá antigua bahamas barbados cuba dominica granada haití jamaica república dominicana san cristóbal santa lucía san vicente trinidad';

  // Tarjeta 1: usar o no la hora del dispositivo
  const devSwitch = el('label', 'st-switch');
  const devCb = el('input'); devCb.type = 'checkbox'; devCb.setAttribute('aria-label', 'Usar la hora de mi dispositivo');
  devSwitch.append(devCb, el('span'));
  const devRow = row('Usar la hora de mi dispositivo', 'Encendido: el reloj sigue la hora y la zona de tu dispositivo. Apágalo para elegir un país.', devSwitch);
  devRow.dataset.q += ' hora dispositivo local reloj sistema zona horaria';
  const paintTz = () => {
    const dev = clockUsesDevice();
    devCb.checked = dev;
    tzCtl.value = clockTZChoice();
    tzRow.classList.toggle('st-off', dev);
    const btn = tzRow.querySelector('.st-select'); if(btn) btn.disabled = dev;
  };
  devCb.addEventListener('change', () => {
    setClockDevice(devCb.checked);
    paintTz(); paintManual(true);
  });

  // Tarjeta 3: hora manual como base
  const pad2 = n => String(n).padStart(2, '0');
  const mTime = el('input', 'st-input'); mTime.type = 'time'; mTime.id = 'stManualTime';
  const mDate = el('input', 'st-input'); mDate.type = 'date'; mDate.id = 'stManualDate';
  const field = (label, input) => { const f = el('label', 'st-field'); f.htmlFor = input.id; f.append(el('span', '', label), input); return f; };
  const mGrid = el('div', 'st-time-grid'); mGrid.append(field('Fecha', mDate), field('Hora', mTime));
  const mUse = el('button', 'st-btn st-primary', 'Usar esta hora'); mUse.type = 'button';
  const mReset = el('button', 'st-btn', 'Volver a la hora real'); mReset.type = 'button';
  const mStatus = el('span', 'st-pill');
  const mFoot = el('div', 'st-time-foot'); mFoot.append(mUse, mReset, mStatus);
  const manualRow = el('div', 'st-row st-time');
  manualRow.append(mGrid, mFoot);
  manualRow.dataset.q = 'hora actual manual base escribir fecha reloj ajustar cambiar';
  rows.push(manualRow);
  // Rellena los campos con la hora que se está mostrando
  let mDirty = false, mAutoDate = '', mAutoTime = '';   // mDirty: la persona ya está editando, no se pisa lo que escribe
  function paintManual(fill){
    if(fill) mDirty = false;
    const now = new Date(Date.now() + clockOffset), tz = clockTZ ? clockTZ[2] : undefined;
    if(fill){
      try{
        const q = {};
        new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
          .formatToParts(now).forEach(x => { q[x.type] = Number(x.value); });
        mDate.value = q.year + '-' + pad2(q.month) + '-' + pad2(q.day);
        mTime.value = pad2(q.hour % 24) + ':' + pad2(q.minute);
        mAutoDate = mDate.value; mAutoTime = mTime.value;
      }catch(e){}
    }
    mStatus.textContent = clockOffset ? 'Usando hora manual' : 'Usando la hora real';
    mStatus.classList.toggle('on', !!clockOffset);
    mReset.disabled = !clockOffset;
  }
  mUse.addEventListener('click', () => {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(mDate.value), t = /^(\d{2}):(\d{2})$/.exec(mTime.value);
    if(!d || !t){ mStatus.textContent = 'Escribe una fecha y hora válidas'; mStatus.classList.remove('on'); return; }
    setManualTime(+d[1], +d[2], +d[3], +t[1], +t[2]);
    paintManual(true);
  });
  mReset.addEventListener('click', () => { clearManualTime(); paintManual(true); });
  // Los campos siguen la hora que se muestra (dispositivo o país) hasta que los edites
  [mDate, mTime].forEach(i => {
    i.addEventListener('input', () => { mDirty = true; });
    i.addEventListener('focus', () => { mDirty = true; });
    i.addEventListener('blur', () => { if(mDate.value === mAutoDate && mTime.value === mAutoTime) mDirty = false; });
  });
  setInterval(() => { if(!mDirty && mTime.offsetParent !== null) paintManual(true); }, 1000);
  syncs.push(() => { paintTz(); paintManual(true); });
  paintTz(); paintManual(true);

  sections.push({ id: 'hora', label: 'Hora', icon: ICON.clock, cards: [
    card('Hora del dispositivo', '¿Quieres usar la hora de tu dispositivo en la página principal?', devRow),
    card('País', 'Si apagas la hora del dispositivo, elige el país cuyo horario quieres ver. Se ajusta solo con los cambios de horario de cada país.', tzRow),
    pcOnly(card('Hora actual', 'Escribe la fecha y la hora de ahora (en la zona que se muestra). La página las usa como base y el reloj sigue avanzando desde ahí.', manualRow))
  ]});

  // Clima
  sections.push({ id: 'clima', label: 'Clima', icon: ICON.cloud, cards: [
    card('Clima de México', 'Elige tu estado para ver su clima en la página principal. Se usa la ciudad capital de cada estado.', stateRow),
    card('Ubicación del clima', 'Por defecto se muestra el lugar configurado en la página. También puedes hacer clic en el clima para usar tu ubicación.',
      actionButton('Volver al lugar por defecto', 'Olvida la ubicación guardada y recarga la página.', 'Restablecer',
        () => { store.del('startpage_weather_place'); store.del('startpage_weather_cache'); location.reload(); }, false))
  ]});

  // Privacidad
  // Contraseña de la página (candado con casillas animadas)
  const lockCtl = el('div', 'st-lock-actions');
  const lockRow = row('Contraseña de la página', 'Pide 4 dígitos cada vez que abres la página.', lockCtl);
  lockRow.dataset.q += ' contraseña candado bloquear pin código privacidad';
  function refreshLock(){
    const has = window.AKON_LOCK && AKON_LOCK.has();
    const saves = window.AKON_CONSENT && AKON_CONSENT.accepted();
    lockRow.querySelector('small').textContent = (has
      ? 'Activa: se piden ' + 4 + ' dígitos cada vez que abres la página.'
      : 'Pide 4 dígitos cada vez que abres la página.')
      + (saves ? '' : ' Para que se conserve al cerrar el navegador, acepta las cookies.');
    // Celular: la contraseña es Beta
    const mobile = document.documentElement.dataset.device === 'mobile';
    const h3 = lockRow.closest('.st-card') && lockRow.closest('.st-card').querySelector('h3');
    if(h3){
      const old = h3.querySelector('.bt-badge'); if(old) old.remove();
      if(mobile) h3.append(el('span', 'bt-badge', 'BETA'));
    }
    lockCtl.textContent = '';
    const mk = (txt, fn, danger) => {
      const b = el('button', 'st-btn' + (danger ? ' danger' : ''), txt); b.type = 'button';
      b.addEventListener('click', fn); lockCtl.append(b);
    };
    if(!has) mk(mobile ? 'Crear contraseña (Beta)' : 'Crear contraseña', () => {
      if(!mobile){ AKON_LOCK.create(refreshLock); return; }
      if(typeof betaWarning !== 'function'){ AKON_LOCK.create(refreshLock); return; }
      betaWarning({
        title: 'Contraseña',
        text: 'La contraseña no está hecha de forma nativa para móvil, pero estamos trabajando para traerla nativamente a móvil. Mientras tanto, algunas partes pueden verse o funcionar distinto a como esperas.',
        onContinue: () => AKON_LOCK.create(refreshLock)
      });
    });
    else{
      mk('Cambiar', () => AKON_LOCK.change(refreshLock));
      mk('Quitar', () => AKON_LOCK.remove(refreshLock), true);
    }
  }
  refreshLock();
  syncs.push(refreshLock);
  document.addEventListener('akon-consent', refreshLock);

  sections.push({ id: 'privacidad', label: 'Privacidad y datos', icon: ICON.lock, cards: [
    card('Contraseña', 'Bloquea la página con un candado de 4 dígitos. Es para que nadie curiosee; no sustituye a una seguridad real.', lockRow),
    card('Datos en este navegador', 'Todo se guarda solo en este navegador; nada se envía a un servidor.',
      historyRow('Búsquedas recientes', 'Elimina el historial de búsquedas, todo o por partes.'),
      actionButton('Accesos directos', 'Elimina todos los accesos que agregaste.', 'Borrar todos',
        () => { store.del('startpage_shortcuts'); location.reload(); }, true)),
    card('Borrar todo', 'Un solo botón para dejar la página como nueva en este navegador.',
      actionButton('Eliminar todos mis datos', 'Borra historial, accesos directos, ajustes, clima, contraseña y tu imagen subida. Solo se conserva tu elección de cookies.', 'Borrar todo',
        () => {
          try{ Object.keys(localStorage).filter(k => k.startsWith('startpage_') && k !== 'startpage_consent').forEach(k => localStorage.removeItem(k)); }catch(e){}
          let fin = false;
          const go = () => { if(fin) return; fin = true; location.reload(); };
          try{
            if(window.indexedDB){
              const rq = indexedDB.deleteDatabase('startpage');
              rq.onsuccess = rq.onerror = rq.onblocked = go;
            }
          }catch(e){}
          setTimeout(go, 900);
        }, true)),
    card('Restablecer', null,
      actionButton('Restablecer todos los ajustes', 'Vuelve a los valores originales (tema, fondo, buscador, accesos directos...). Tu imagen subida no se borra.', 'Restablecer todo',
        () => {
          try{ Object.keys(localStorage).filter(k => k.startsWith('startpage_')).forEach(k => localStorage.removeItem(k)); }catch(e){}
          location.reload();
        }, true))
  ]});

  // Cookies: elección de consentimiento y detalle de lo que se guarda
  ICON.cookie = svg('<path d="M12 3a9 9 0 1 0 9 9 4 4 0 0 1-4-4 4 4 0 0 1-5-5z"/><circle cx="8.5" cy="11" r="1"/><circle cx="12" cy="16" r="1"/><circle cx="15.5" cy="13" r="1"/>');
  const CK = () => window.AKON_CONSENT;
  const THEME_NAMES = { default: 'Predeterminado (sigue el modo claro/oscuro)', brick: 'Ladrillo', purple: 'Morado', blue: 'Azul', green: 'Verde', gray: 'Gris' };
  const HEXRE = /^#[0-9a-f]{6}$/i;
  const fmtDate = t => { try{ return new Date(t).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }); }catch(e){ return ''; } };
  const jget = k => { try{ return JSON.parse(store.get(k)); }catch(e){ return null; } };

  const ckBox = el('div', 'st-ck');     // aquí se dibuja el detalle (se rehace al abrir y al cambiar la elección)
  function ckItem(label, value, color){
    const r = el('div', 'st-row st-ck-row');
    r.append(el('div', '', label));
    const v = el('div', 'st-ck-val');
    if(color && HEXRE.test(color)){ const dot = el('span', 'st-ck-dot'); dot.style.background = color; v.append(dot); }
    v.append(document.createTextNode(value));
    r.append(v);
    return r;
  }
  function ckGroup(title, items){
    const g = el('div', 'st-ck-group');
    g.append(el('h4', '', title), ...items);
    return g;
  }
  function renderCookies(){
    ckBox.textContent = '';
    const c = CK(); if(!c) return;
    const st = c.state();
    const status = st === 'accepted' ? 'Cookies aceptadas' + (c.when() ? ' · ' + fmtDate(c.when()) : '')
                 : st === 'rejected' ? 'Cookies rechazadas · no se guarda nada'
                 : 'Sin decidir · no se guarda nada por ahora';
    ckBox.append(ckItem('Estado', status));
    if(st !== 'accepted'){
      ckBox.append(el('p', 'st-ck-note', 'Con las cookies rechazadas (o sin decidir) la página no guarda tu tema, fondo, accesos directos, clima, buscador ni historial: al recargar vuelve a sus valores originales. Acepta las cookies para que se guarde lo que personalices.'));
      return;
    }
    // Apariencia
    const th = store.get('startpage_theme') || 'default';
    const custom = th.startsWith('custom:') && HEXRE.test(th.slice(7));
    ckBox.append(ckGroup('Apariencia', [
      custom ? ckItem('Color de tema', 'Color personalizado (paleta) · ' + th.slice(7), th.slice(7))
             : ckItem('Color de tema', THEME_NAMES[th] || 'Predeterminado', (THEMES.find(t => t.id === th) || {}).color)
    ]));
    // Fondo de pantalla
    const bgOn = store.get('startpage_bg_enabled') !== 'false';
    const bg = store.get('startpage_background');
    let bgText = 'Ninguno (se usa el fondo normal)';
    if(bg){
      if(bg === 'custom:image') bgText = 'Tu imagen subida (guardada en IndexedDB)';
      else if(/^color:#[0-9a-f]{6}$/i.test(bg)) bgText = 'Color sólido · ' + bg.slice(6);
      else{
        const [catId, file] = bg.split('/');
        const cat = BG_CATEGORIES.find(x => x.id === catId);
        bgText = (cat ? cat.name : catId) + ' · ' + (file || '').replace(/\.[^.]+$/, '');
      }
    }
    const bgColor = store.get('startpage_bg_color');
    const bgItems = [ckItem('Fondos de pantalla', bgOn ? 'Activados' : 'Desactivados'), ckItem('Fondo elegido', bgText, /^color:#/.test(bg || '') ? bg.slice(6) : null)];
    if(bgColor && HEXRE.test(bgColor)) bgItems.push(ckItem('Último color elegido con el gotero', bgColor, bgColor));
    ckBox.append(ckGroup('Fondo de pantalla', bgItems));
    // Accesos directos
    const scOn = store.get('startpage_shortcuts_enabled') !== 'false';
    const rowsN = store.get('startpage_shortcuts_rows') || '1';
    const list = Array.isArray(jget('startpage_shortcuts')) ? jget('startpage_shortcuts') : [];
    const lines = list.filter(i => i && typeof i.url === 'string').map(i => {
      let host = i.url; try{ host = new URL(i.url).hostname.replace(/^www\./, ''); }catch(e){}
      return (typeof i.name === 'string' && i.name ? i.name + ' — ' : '') + host;
    });
    ckBox.append(ckGroup('Accesos directos', [
      ckItem('Accesos directos', scOn ? 'Activados' : 'Desactivados'),
      ckItem('Número de filas', rowsN === '99' ? 'Todas' : rowsN),
      ckItem('Guardados (' + lines.length + ')', lines.length ? lines.join('\n') : 'Ninguno')
    ]));
    // Buscador
    const eng = store.get('startpage_default_engine');
    ckBox.append(ckGroup('Buscador', [ckItem('Buscador predeterminado', (ENGINES[eng] || ENGINES[DEFAULT_ENGINE]).name + (ENGINES[eng] ? '' : ' (por defecto)'))]));
    // Clima
    const wp = jget('startpage_weather_place');
    const wc = jget('startpage_weather_cache');
    const wItems = [wp && Number.isFinite(wp.lat) && Number.isFinite(wp.lon)
      ? ckItem('Ubicación del clima', 'Tu ubicación en tiempo real (aprox.) · ' + wp.lat + ', ' + wp.lon)
      : ckItem('Ubicación del clima', 'Lugar por defecto · ' + WEATHER_PLACE.name)];
    if(wc && wc.at) wItems.push(ckItem('Última lectura del clima guardada', fmtDate(wc.at)));
    ckBox.append(ckGroup('Clima', wItems));
    // Historial
    let hist = []; try{ hist = loadHistory(); }catch(e){}
    ckBox.append(ckGroup('Historial', [ckItem('Búsquedas recientes (' + hist.length + ')',
      hist.length ? hist.map(h => '“' + h.q + '” · ' + (ENGINES[h.engine] ? ENGINES[h.engine].name : h.engine)).join('\n') : 'Ninguna')]));
    ckBox.append(el('p', 'st-ck-note', 'Además se guarda tu elección sobre las cookies (esta misma decisión) para no volver a preguntarte.'));
  }
  const ckCard = el('section', 'st-card');
  ckCard.append(el('h3', '', 'Lo que se guarda en este navegador'));
  ckCard.append(el('p', '', 'Este es el detalle de cada cosa que cambia en la página cuando la personalizas.'));
  ckCard.append(ckBox);

  sections.push({ id: 'cookies', label: 'Cookies', icon: ICON.cookie, cards: [
    card('Tu elección', 'Puedes cambiarla cuando quieras. Al rechazar se borra todo lo que estaba guardado.',
      actionButton('Aceptar cookies', 'Se guardará todo lo que personalices: tema, fondo, accesos directos, clima, buscador e historial.', 'Aceptar',
        () => { if(CK()) CK().accept(); }, false),
      actionButton('Rechazar cookies', 'No se guarda nada y se borra lo guardado hasta ahora (incluida tu imagen subida).', 'Rechazar y borrar',
        () => { if(CK()) CK().reject(); }, true)),
    ckCard
  ]});
  syncs.push(renderCookies);
  if(CK()) CK().onChange(renderCookies);

  // Acerca de
  const DOC_ICON = svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/>');
  function linkRow(label, desc, key){
    const b = el('button', 'st-btn st-link'); b.type = 'button';
    b.innerHTML = DOC_ICON; b.append(document.createTextNode('Leer'));
    b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-label', 'Leer ' + label);
    b.addEventListener('click', () => openDoc(key, b));
    return row(label, desc, b);
  }
  // Enlace al GitHub del creador
  const GH_URL = 'https://github.com/Emiliano-HN';
  const GH_ICON = svg('<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>');
  const ghBtn = el('button', 'st-btn st-link'); ghBtn.type = 'button';
  ghBtn.innerHTML = GH_ICON; ghBtn.append(document.createTextNode('Abrir GitHub'));
  ghBtn.setAttribute('aria-label', 'Abrir el GitHub del creador (se abre en una pestaña nueva)');
  ghBtn.addEventListener('click', () => safeOpen(GH_URL));
  const ghRow = row('GitHub', 'github.com/Emiliano-HN', ghBtn);
  ghRow.dataset.q += ' github creador perfil código repositorio emiliano';

  sections.push({ id: 'acerca', label: 'Acerca de', icon: ICON.info, cards: [
    card('AKON Search', null,
      row('Hecho por', 'Emiliano Hernández Navarrete'),
      row('Sobrenombre', 'h3nix'),
      ghRow,
      pcOnly(row('Atajos', shortcutsList()))),
    card('Legal', 'Qué datos usa esta página y bajo qué condiciones se ofrece.',
      linkRow('Política de privacidad', 'Qué se guarda en tu navegador y qué se envía a otros sitios.', 'privacidad'),
      linkRow('Cookies', 'Qué almacenamiento usa la página y cómo borrarlo.', 'cookies'),
      linkRow('Términos de uso', 'Condiciones para usar AKON Search.', 'terminos'))
  ]});

  /* ---------- Estructura ---------- */
  const root = el('div', 'st'); root.id = 'settings'; root.setAttribute('aria-hidden', 'true');
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Ajustes');

  const side = el('aside', 'st-side');
  const title = el('div', 'st-title');
  const logo = el('img'); logo.alt = ''; logo.src = 'images/Logo.png'; logo.addEventListener('error', () => logo.remove());
  title.append(logo, el('span', '', 'Ajustes'));
  const nav = el('ul', 'st-nav');
  side.append(title, nav);

  const main = el('div', 'st-main');
  const col = el('div', 'st-col');
  const searchBox = el('div', 'st-search');
  searchBox.innerHTML = ICON.search;
  const input = el('input'); input.type = 'text'; input.maxLength = 80; input.placeholder = 'Buscar en ajustes';
  input.setAttribute('aria-label', 'Buscar en ajustes'); input.autocomplete = 'off'; input.spellcheck = false;
  // Esta barra no admite copiar, cortar, pegar ni deshacer: ni con atajos (Ctrl + C / X / V / Z, y Ctrl + Y para rehacer)
  // ni con el menú del clic derecho. Se puede escribir y borrar con normalidad.
  // Cada intento muestra un aviso arriba explicando que no se puede.
  const BLOCKED_MSG = {
    c: 'No se puede copiar en la barra de ajustes.',
    x: 'No se puede cortar en la barra de ajustes.',
    v: 'No se puede pegar en la barra de ajustes.',
    z: 'No se puede deshacer en la barra de ajustes.',
    y: 'No se puede rehacer en la barra de ajustes.'
  };
  input.addEventListener('keydown', e => {
    if(!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const msg = BLOCKED_MSG[e.key.toLowerCase()];
    if(!msg) return;
    e.preventDefault();
    showSettingsWarning(e.key.toLowerCase() === 'z' && e.shiftKey ? BLOCKED_MSG.y : msg);
  });
  [['copy', 'c'], ['cut', 'x'], ['paste', 'v']].forEach(([ev, k]) => input.addEventListener(ev, e => {
    e.preventDefault();
    showSettingsWarning(BLOCKED_MSG[k]);   // llega por el menú del clic derecho o Shift + Insert
  }));
  input.addEventListener('beforeinput', e => {
    if(e.inputType !== 'historyUndo' && e.inputType !== 'historyRedo') return;
    e.preventDefault();
    showSettingsWarning(e.inputType === 'historyUndo' ? BLOCKED_MSG.z : BLOCKED_MSG.y);
  });
  searchBox.append(input);
  // Celular: botón × para borrar lo escrito (solo aparece cuando hay texto; ver .st-sclear en style_mov.css)
  const clearBtn = el('button', 'st-sclear'); clearBtn.type = 'button'; clearBtn.setAttribute('aria-label', 'Borrar búsqueda');
  clearBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="7" y1="7" x2="17" y2="17"></line><line x1="17" y1="7" x2="7" y2="17"></line></svg>';
  clearBtn.addEventListener('click', () => { input.value = ''; filter(); input.focus(); });
  searchBox.append(clearBtn);
  col.append(searchBox);

  const pages = new Map(), navBtns = new Map();
  for(const s of sections){
    const page = el('div', 'st-page'); page.id = 'st-' + s.id;
    const h = el('h2'); h.innerHTML = s.icon; h.append(document.createTextNode(s.label));
    page.append(h, ...s.cards);
    pages.set(s.id, page); col.append(page);

    const li = el('li'); const b = el('button'); b.type = 'button';
    b.innerHTML = s.icon; b.append(el('span', 'st-nl', s.label)); b.title = s.label; b.setAttribute('aria-label', s.label);
    b.addEventListener('click', () => { input.value = ''; filter(); show(s.id); main.scrollTop = 0; root.classList.add('m-page'); root.scrollTop = 0; });
    li.append(b); nav.append(li); navBtns.set(s.id, b);
    if(s.id === 'privacidad') nav.insertBefore(el('li', 'st-sep'), li);   // separador antes del segundo grupo
  }
  const empty = el('div', 'st-empty', 'No se encontraron ajustes con ese texto.');
  col.append(empty);
  main.append(col);

  const backIn = el('button'); backIn.type = 'button'; backIn.innerHTML = ICON.back; backIn.append(el('span', 'st-nl', 'Volver a la página')); backIn.title = 'Volver a la página'; backIn.setAttribute('aria-label', 'Volver a la página');
  backIn.addEventListener('click', () => close());
  const backWrap = el('div', 'st-back'); const ul = el('ul', 'st-nav'); const li2 = el('li'); li2.append(backIn); ul.append(li2); backWrap.append(ul);
  side.append(backWrap);

  // Celular: Ajustes funciona como una lista (como los ajustes del iPhone). Al tocar una sección se abre su página,
  // con este botón "‹ Ajustes" para volver a la lista. Las clases m-page / m-search solo tienen efecto en el celular (style_mov.css).
  const isMob = () => document.documentElement.dataset.device === 'mobile';
  const mBack = el('button', 'st-mback'); mBack.type = 'button'; mBack.setAttribute('aria-label', 'Volver a la lista de ajustes');
  mBack.innerHTML = ICON.back; mBack.append(el('span', '', 'Ajustes'));
  function goList(){ root.classList.remove('m-page'); input.value = ''; filter(); root.scrollTop = 0; }
  mBack.addEventListener('click', goList);

  root.append(mBack, side, main, histModal, docModal);
  document.body.append(root);

  let current = 'inicio';
  function show(id){
    current = id;
    pages.forEach((p, k) => p.classList.toggle('show', k === id));
    navBtns.forEach((b, k) => { b.classList.toggle('active', k === id); b.toggleAttribute('aria-current', k === id); });
  }
  // Buscador: con texto, se muestran todas las secciones pero solo lo que coincide
  function filter(){
    const q = input.value.trim().toLowerCase();
    root.classList.toggle('m-search', !!q);
    searchBox.classList.toggle('has-text', !!q);          // celular: con texto se ven los resultados en lugar de la lista
    const mobileNow = document.documentElement.dataset.device === 'mobile';
    rows.forEach(r => r.classList.toggle('hide', !!q && (!r.dataset.q.includes(q) || (mobileNow && r.classList.contains('st-pc-only')))));   // lo solo-de-computadora no se busca en el celular
    let any = false;
    pages.forEach(p => {
      let pageHas = false;
      p.querySelectorAll('.st-card').forEach(c => {
        if(c.classList.contains('st-pc-only') && document.documentElement.dataset.device === 'mobile'){ c.classList.add('hide'); return; }   // no existe en el celular
        const has = !q || [...c.querySelectorAll('.st-row')].some(r => !r.classList.contains('hide'))
          || c.querySelector('h3').textContent.toLowerCase().includes(q);
        if(q && has && c.querySelector('h3').textContent.toLowerCase().includes(q)) c.querySelectorAll('.st-row').forEach(r => r.classList.remove('hide'));
        c.classList.toggle('hide', !has);
        if(has) pageHas = true;
      });
      p.classList.toggle('hide', !pageHas);
      if(q) p.classList.toggle('show', pageHas);
      if(pageHas) any = true;
    });
    if(!q) show(current);
    empty.classList.toggle('show', !!q && !any);
  }
  input.addEventListener('input', filter);

  /* ---------- Abrir y cerrar ---------- */
  let opener = null;
  function open(){
    opener = document.activeElement;
    const panelClose = $('bgClose'); if(panelClose && $('bgPanel') && $('bgPanel').classList.contains('open')) panelClose.click();
    syncs.forEach(f => { try{ f(); }catch(e){} });
    input.value = ''; filter(); show('inicio');
    placeBgGrid();                                          // los fondos viven aquí (celular) o en el panel (computadora)
    root.classList.remove('m-page'); root.scrollTop = 0;     // celular: siempre se abre en la lista
    root.classList.add('open'); root.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if(document.documentElement.dataset.device !== 'mobile') setTimeout(() => input.focus(), 60);   // en el celular no se abre el teclado solo
  }
  function close(){
    closeDd(); closeHistory(); closeDoc();
    root.classList.remove('open'); root.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if(opener && opener.focus) try{ opener.focus(); }catch(e){}
  }
  const isOpen = () => root.classList.contains('open');

  moreBtn.addEventListener('click', open);
  document.addEventListener('akon-open-settings', e => {
    const detail = (e.detail && pages.has(e.detail)) ? e.detail : null;
    if(isMob() && isOpen() && !detail){ goList(); return; }     // celular: tocar el engranaje otra vez vuelve a la lista
    open(); show(detail || 'inicio'); main.scrollTop = 0; root.scrollTop = 0;
    if(isMob() && detail) root.classList.add('m-page');
  });
  document.addEventListener('akon-close-settings', () => { if(isOpen()) close(); });   // la barra del celular lo usa al cambiar de pestaña
  document.addEventListener('keydown', e => {
    if(isOpen() && e.key === 'Escape'){
      e.preventDefault(); e.stopImmediatePropagation();
      if(openDd){ const b = openDd.btn; closeDd(); b.focus(); }
      else if(docIsOpen()) closeDoc();
      else if(histIsOpen()) closeHistory();
      else close();
    }
  }, true);
  // Mientras Ajustes está abierto, las teclas no llegan a los atajos de la página
  root.addEventListener('keydown', e => e.stopPropagation());

  /* ---------- Acento del tema: botones, lista, contornos y engranaje ---------- */
  let lastAcc = null;
  function paintAccent(){
    const c = themeColor();
    if(c === lastAcc) return;
    const first = lastAcc === null;
    lastAcc = c;
    const de = document.documentElement, acc = c || '#b8a1ff';
    if(first) de.classList.add('ak-nt');                         // al cargar no se anima: el color ya estaba guardado
    de.style.setProperty('--ak-acc', acc);
    de.style.setProperty('--ak-ink', lum(acc) > .2 ? '#15111f' : '#ffffff');   // texto oscuro o claro según el color
    de.style.setProperty('--ak-foot', c ? blend(c, '#ffffff', .45) : '#c9adff');
    root.classList.toggle('themed', !!c);
    markTheme();
    if(first) requestAnimationFrame(() => requestAnimationFrame(() => de.classList.remove('ak-nt')));
  }
  paintAccent();
  new MutationObserver(paintAccent).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });

  /* ---------- Buscador predeterminado al iniciar ---------- */
  try{
    const saved = store.get(ENGINE_KEY);
    if(saved && ENGINES[saved] && saved !== currentEngine && !hiddenEngines().includes(saved)) setEngine(saved);
  }catch(e){}
})();

/* Enlaces de las secciones: el nombre sale como globito al pasar el mouse (cuando solo se ve el logo) */
document.querySelectorAll('.grid a').forEach(a => {
  const name = a.textContent.trim();
  if(name){ a.dataset.name = name; a.setAttribute('aria-label', name); }
});

// Marca que script_pc.js terminó de cargar: script_mov.js solo actúa si esta marca existe
window.AKON_PC_LOADED = true;
