'use strict';
/* =========================================================
   script_mov.js — solo el modo celular (Beta)
   Se carga siempre después de script_pc.js y usa sus funciones (byId, reducedMotion...).
   - Aviso Beta (lo usa la contraseña en el celular)
   - Barra de navegación líquida de 3 pestañas (Inicio, Enlaces y Ajustes)
   En computadora esta parte no hace nada.
   ========================================================= */

/* ---------- Aviso Beta en celular (lo usa la contraseña de la página) ---------- */
let betaWarnOpen = false;
function betaWarning({ title, text, onContinue }){
  if(betaWarnOpen) return;
  betaWarnOpen = true;
  const prevFocus = document.activeElement;
  const mk = (tag, cls, txt) => { const n = document.createElement(tag); if(cls) n.className = cls; if(txt != null) n.textContent = txt; return n; };
  const ov  = mk('div', 'bt-modal');
  const win = mk('div', 'bt-win');
  win.setAttribute('role', 'dialog'); win.setAttribute('aria-modal', 'true'); win.setAttribute('aria-labelledby', 'btTitle');
  const h = mk('h3', '', title); h.id = 'btTitle';
  const head = mk('div', 'bt-head'); head.append(h, mk('span', 'bt-badge', 'BETA'));
  const btns = mk('div', 'bt-btns');
  const no  = mk('button', 'bt-btn', 'Cancelar'); no.type = 'button';
  const yes = mk('button', 'bt-btn bt-primary', 'Continuar'); yes.type = 'button';
  btns.append(no, yes);
  win.append(head, mk('p', 'bt-text', text), btns);
  ov.append(win);
  document.body.append(ov);
  requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('open')));
  let done = false;
  const finish = fn => {
    if(done) return;
    done = true; betaWarnOpen = false;
    document.removeEventListener('keydown', onKey, true);
    ov.classList.remove('open');
    setTimeout(() => ov.remove(), reducedMotion() ? 0 : 300);
    try{ prevFocus && prevFocus.focus && prevFocus.focus(); }catch(e){}
    if(fn) fn();
  };
  const onKey = e => {
    if(e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); finish(); }
    else if(e.key === 'Tab'){ e.preventDefault(); (document.activeElement === no ? yes : no).focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  yes.addEventListener('click', () => finish(onContinue));
  no.addEventListener('click', () => finish());
  setTimeout(() => yes.focus(), 60);
}

/* ---------- 17. Celular: barra de navegación líquida ----------
   Solo funciona cuando <html data-device="mobile"> (ver "Dispositivo" más arriba). Tres pestañas:
   Inicio y Enlaces cambian lo que se ve (body[data-mtab]); Ajustes abre la pantalla de Ajustes.
   La barra es un cristal (liquid glass) con un hueco que sigue a la burbuja de cristal; al cambiar de pestaña la burbuja se desliza
   y el hueco se estira un poco, como un líquido. */
(() => {
  if(!window.AKON_PC_LOADED) return;                               // script_pc.js no cargó bien: no se hace nada
  if(document.documentElement.dataset.device !== 'mobile') return;   // en computadora esta barra no existe
  const nav = byId('mnav');
  if(!nav) return;
  const pathEl = byId('mnavPath'), shadowEl = byId('mnavShadow'), glassEl = byId('mnavGlass'), bubble = byId('mnavBubble');
  const items = [...nav.querySelectorAll('.mnav-item')];
  const H = 64, R = 26, CY = 4;            // alto de la barra, radio de la burbuja y cuánto baja su centro desde el borde de arriba
  const PAD = 18, CORNER = 16;             // margen lateral de los iconos y redondeo de las esquinas de la barra
  const HALF = 44, DEPTH = 38, SHOULDER = 16;   // media anchura del hueco, su profundidad y la suavidad de sus hombros
  const DUR = 560;                         // ms que tarda la burbuja en cambiar de pestaña
  let W = 0, cx = 0, current = 0, raf = 0;

  const isMobile = () => document.documentElement.dataset.device === 'mobile';
  const center = i => PAD + (i + .5) * (W - PAD * 2) / items.length;

  // Dibuja la barra con el hueco centrado en x. "stretch" lo ensancha (y lo hace menos hondo) mientras la burbuja viaja
  function draw(x, stretch = 0){
    const a = HALF + stretch, d = DEPTH - stretch * .35, k = SHOULDER, r = CORNER;
    const shape =
      `M${r},0 H${x - a} C${x - a + k},0 ${x - a + k * .9},${d} ${x},${d} C${x + a - k * .9},${d} ${x + a - k},0 ${x + a},0 ` +
      `H${W - r} Q${W},0 ${W},${r} V${H - r} Q${W},${H} ${W - r},${H} H${r} Q0,${H} 0,${H - r} V${r} Q0,0 ${r},0 Z`;
    pathEl.setAttribute('d', shape);                 // borde de luz
    shadowEl.setAttribute('d', shape);               // sombra
    glassEl.style.clipPath = `path("${shape}")`;     // el cristal (con su desenfoque) toma la misma forma
    const sx = 1 + stretch * .012, sy = 1 - stretch * .006;
    bubble.style.transform = `translateX(${x - R}px) scale(${sx}, ${sy})`;
    cx = x;
  }
  function measure(){
    W = nav.clientWidth;
    nav.querySelectorAll('svg').forEach(sv => { if(sv.classList.contains('mnav-shadow') || sv.classList.contains('mnav-rim')) sv.setAttribute('viewBox', `0 0 ${W} ${H}`); });
    cancelAnimationFrame(raf);
    draw(center(current));
  }

  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function moveTo(i, animate = true){
    const from = cx, to = center(i);
    cancelAnimationFrame(raf);
    if(!animate || reducedMotion() || from === to){ draw(to); return; }
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / DUR);
      draw(from + (to - from) * ease(t), Math.sin(Math.PI * t) * 16);
      if(t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function setActive(i, animate = true){
    if(i === current && animate) return;
    current = i;
    items.forEach((b, n) => { b.classList.toggle('active', n === i); if(n === i) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    moveTo(i, animate);
  }

  // Pestaña de contenido (Inicio / Enlaces) → body[data-mtab]
  let page = 0;                            // la última pestaña de contenido (0 = Inicio, 1 = Enlaces)
  function showPage(i){
    page = i;
    document.body.dataset.mtab = i === 0 ? 'home' : 'links';
    window.scrollTo(0, 0);
    const main = document.querySelector('main');
    if(main && !reducedMotion()) main.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
      { duration: 360, easing: 'cubic-bezier(.22,1,.36,1)' });
  }

  items.forEach((btn, i) => btn.addEventListener('click', () => {
    if(btn.dataset.tab === 'settings'){
      setActive(i);
      document.dispatchEvent(new CustomEvent('akon-open-settings'));
      return;
    }
    document.dispatchEvent(new CustomEvent('akon-close-settings'));     // si Ajustes estaba abierto, se cierra
    if(i === current) return;
    showPage(i);
    setActive(i);
  }));

  // Al cerrar Ajustes, la burbuja vuelve a la pestaña en la que estabas
  const settings = byId('settings');
  if(settings) new MutationObserver(() => {
    if(!settings.classList.contains('open') && items[current].dataset.tab === 'settings') setActive(page);
  }).observe(settings, { attributes: true, attributeFilter: ['class'] });

  document.body.dataset.mtab = 'home';
  if(typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(nav); else window.addEventListener('resize', measure);
  measure();
})();

/* ---------- 18. Celular: los menús desplegables de Ajustes no se meten bajo la barra ----------
   Pasa lo mismo que con el buscador del inicio (fitMenuAboveNav en script_pc.js): el menú debe terminar ANTES de la barra
   de navegación. Si abajo no cabe y arriba hay más espacio, se abre hacia arriba; si aun así no cabe, se desplaza por dentro.
   Funciona con los dos tipos de lista de Ajustes (.st-dd y .cz-dd) sin tocar script_pc.js: se queda mirando cuándo se abren. */
(() => {
  if(!window.AKON_PC_LOADED) return;
  const GAP = 12;                 // espacio libre entre el menú y la barra de abajo
  const MAX = 380;                // alto máximo de cualquier menú, en px
  const sel = '.st-dd, .cz-dd';

  function fit(dd, keepDir){
    const menu = dd.querySelector('.st-menu, .cz-dd-menu');
    const btn  = dd.querySelector('button');
    const nav  = byId('mnav');
    if(!menu || !btn) return;
    if(document.documentElement.dataset.device !== 'mobile' || !nav){       // en computadora no se toca nada
      menu.style.maxHeight = ''; menu.style.overflowY = ''; menu.style.overscrollBehavior = '';
      return;
    }
    const area = byId('settings');
    const topLimit = (area ? area.getBoundingClientRect().top : 0) + 8;
    const r = btn.getBoundingClientRect();
    const below = nav.getBoundingClientRect().top - r.bottom - 8 - GAP;    // espacio libre hacia abajo
    const above = r.top - topLimit - 8;                                    // espacio libre hacia arriba
    if(!keepDir){                                                          // la dirección se decide solo al abrir
      menu.style.maxHeight = '';
      const need = menu.scrollHeight + 2;                                  // alto real que necesita la lista
      dd.classList.toggle('up', need > below && above > below);
    }
    const avail = dd.classList.contains('up') ? above : below;
    menu.style.maxHeight = Math.max(120, Math.floor(Math.min(avail, MAX))) + 'px';
    menu.style.overflowY = 'auto';
    menu.style.overscrollBehavior = 'contain';
  }

  // Cuando a una lista se le pone la clase "open", se ajusta
  new MutationObserver(list => {
    for(const m of list){
      const dd = m.target;
      if(!dd.matches || !dd.matches(sel)) continue;
      const wasOpen = (m.oldValue || '').split(/\s+/).includes('open');
      if(dd.classList.contains('open') && !wasOpen) fit(dd, false);
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });

  // Si la pantalla se mueve o cambia de tamaño con una lista abierta, se reajusta el alto (la dirección se queda igual)
  const refit = e => {
    if(e && e.target instanceof Element && e.target.closest('.st-menu, .cz-dd-menu')) return;   // el scroll de la propia lista no cuenta
    document.querySelectorAll('.st-dd.open, .cz-dd.open').forEach(dd => fit(dd, true));
  };
  window.addEventListener('resize', refit);
  document.addEventListener('scroll', refit, { capture: true, passive: true });
})();
