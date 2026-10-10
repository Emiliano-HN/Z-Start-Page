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