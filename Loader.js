'use strict';
/* =========================================================
   Loader.js — arranque de AKON Search (es lo ÚNICO que carga Start_Page.html al principio).
   Orden:
     1) Se borra el caché de la página (Cache Storage; tus ajustes NO se tocan).
     2) Verifica que EXISTAN los 4 archivos (style_pc.css, script_pc.js, style_mov.css, script_mov.js) preguntando solo por el nombre:
        no se descargan, es una petición HEAD.
     3) Detecta si abriste desde celular o computadora (misma lógica de Ajustes → Apariencia → Dispositivo).
     4) Descarga SOLO los archivos de ese dispositivo (nunca los del otro) y les pasa el control.
        Esos archivos traen la pantalla de carga PRINCIPAL (HTML, CSS, JavaScript, Dispositivo e Imágenes) y vuelven a borrar el caché al terminar.

   La verificación de este archivo ocurre EN SEGUNDO PLANO: no muestra nada (solo un fondo del mismo color que la página,
   para que no haya parpadeos). En cuanto los estilos están listos, se destapa la pantalla de carga principal.
   Solo si algo falla (falta un archivo, no hay internet, error de descarga) esta pantalla de verificación se hace visible con el error.

   Atajos: Ctrl + R (recarga sin pantalla de carga) y Ctrl + X (entrar sin internet) se saltan este paso y van directo a cargar los archivos.
   ========================================================= */
(() => {
  const root = document.documentElement;
  const FILES = { pc: ['style_pc.css', 'script_pc.js'], mov: ['style_mov.css', 'script_mov.js'] };
  const session = k => { try{ return sessionStorage.getItem(k); }catch(e){ return null; } };

  /* ---------- Dispositivo (misma lógica que Ajustes → Apariencia → Dispositivo) ---------- */
  function detectDevice(){
    let mode = 'auto';
    try{ const v = localStorage.getItem('startpage_device_mode'); if(['auto', 'ua', 'screen', 'pc', 'mobile'].includes(v)) mode = v; }catch(e){}
    const uad = navigator.userAgentData, ua = navigator.userAgent || '';
    const byUA = !!(uad && uad.mobile === true)
      || /Android|iPhone|iPad|iPod|Mobile|Windows Phone|IEMobile|BlackBerry|Opera Mini|webOS/i.test(ua)
      || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const byScreen = Math.min(screen.width || innerWidth, screen.height || innerHeight) <= 500;
    if(mode === 'pc')     return { mobile: false, how: 'elegido por ti' };
    if(mode === 'mobile') return { mobile: true,  how: 'elegido por ti' };
    if(mode === 'ua')     return { mobile: byUA, how: 'User-Agent' };
    if(mode === 'screen') return { mobile: byScreen, how: 'tamaño de pantalla' };
    return { mobile: byUA || byScreen, how: byUA && byScreen ? 'User-Agent y pantalla' : byUA ? 'User-Agent' : byScreen ? 'tamaño de pantalla' : 'User-Agent y pantalla' };
  }

  /* ---------- Caché: se borra lo que la página guarda (Cache Storage y las listas de nombres de GitHub). Tus ajustes no se tocan. ---------- */
  async function clearCaches(){
    try{ if(window.caches){ const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } }catch(e){}
    try{ Object.keys(localStorage).filter(k => k.startsWith('startpage_ghdir:')).forEach(k => localStorage.removeItem(k)); }catch(e){}
  }

  /* ---------- ¿Existe el archivo? Solo se pregunta (HEAD), no se descarga ---------- */
  const served = /^https?:$/.test(location.protocol);
  async function exists(name){
    if(!served) return true;                      // abierta con doble clic (file://) no hay a quién preguntar: se verá al cargar
    const url = new URL(name, document.baseURI).href;
    try{
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if(r.status === 404 || r.status === 410) return false;
      if(r.ok) return true;
    }catch(e){ if(navigator.onLine === false) return null; }   // null = no se pudo preguntar (sin internet)
    try{                                           // el servidor no acepta HEAD: se pregunta con GET
      const r = await fetch(url, { cache: 'no-store' });
      return r.ok;
    }catch(e){ return navigator.onLine === false ? null : false; }
  }

  /* ---------- Descarga de los archivos del dispositivo ---------- */
  const loadCss = href => new Promise((ok, fail) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    l.onload = () => ok(); l.onerror = () => fail(new Error(href));
    document.head.append(l);
  });
  const loadJs = src => new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => ok(); s.onerror = () => fail(new Error(src));
    document.body.append(s);
  });
  async function download(part){
    root.dataset.device = part === 'mov' ? 'mobile' : 'pc';
    await loadCss(FILES[part][0]);                // primero los estilos: así la pantalla de carga de la página ya sale con su diseño
    await loadJs(FILES[part][1]);
  }
  /* ---------- Qué se ve y cuándo ----------
     - El buscador y todo el contenido de la página quedan OCULTOS (style#bootHide) hasta que la pantalla de carga termina.
       Se destapan solos cuando la pantalla de carga empieza su salida (body.intro-reveal) o ya no existe (sin intro-active).
     - La pantalla de carga (#intro) y las pantallas de error (#errPage) se destapan antes (showIntro), pero solo cuando
       el script de la página ya la armó por completo: así nunca se ve a medio hacer (logo suelto, 0 %, lista vacía).
     - Esta pantalla de verificación nunca se ve; solo si hay un error. */
  const body = document.body;
  const hideStyle = document.getElementById('bootHide');
  // el respaldo del HTML (9 s) no servía y era demasiado corto: ahora es de 60 s
  if(hideStyle) hideStyle.textContent = 'body > :not(#boot):not(script){visibility:hidden; animation:bootShow 0s 60s forwards} @keyframes bootShow{to{visibility:visible}}';
  // fondo del color de la página desde el primer instante (sin destello blanco)
  try{
    const m = localStorage.getItem('startpage_mode');
    const dark = m === 'dark' || (m !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    root.style.backgroundColor = dark ? '#15161a' : '#f6f5f2';
  }catch(e){}

  function showIntro(){
    if(document.getElementById('bootIntro')) return;
    const s = document.createElement('style');
    s.id = 'bootIntro';
    s.textContent = 'body > #intro, body > #errPage{visibility:visible !important}';
    document.head.append(s);
  }
  function revealPage(){
    if(revealPage.done) return;
    revealPage.done = true;
    watcher.disconnect();
    clearTimeout(safety);
    ['bootHide', 'bootIntro'].forEach(id => { const n = document.getElementById(id); if(n) n.remove(); });
    root.style.backgroundColor = '';
  }
  const introDone = () => !body.classList.contains('intro-active') || body.classList.contains('intro-reveal');
  const watcher = new MutationObserver(() => { if(introDone()) revealPage(); });
  const safety = setTimeout(revealPage, 45000);          // por si algo se atora: la página no se queda oculta para siempre
  watcher.observe(body, { attributes: true, attributeFilter: ['class'] });

  /* ---------- Atajos: se saltan este paso y van directo a cargar ---------- */
  const fast = session('akon_skip_intro') === '1' || session('akon_skip_offline') === '1' || session('akon_off_js') === '1';

  /* ---------- Pantalla de verificación (EN SEGUNDO PLANO: invisible salvo que haya un error) ---------- */
  function buildBoot(){
    let saved = null; try{ saved = localStorage.getItem('startpage_mode'); }catch(e){}
    if(saved === 'dark' || saved === 'light') root.dataset.mode = saved;   // mismo fondo que usará la pantalla de carga principal
    const dark = saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const c = dark ? { bg: '#15161a', ink: '#f2f1ed', muted: '#9a9ba3', line: '#2b2c32', acc: '#e6e6ea', bad: '#d94b4b' }
                   : { bg: '#f6f5f2', ink: '#1b1b1f', muted: '#6b6f76', line: '#e6e4de', acc: '#4a4a52', bad: '#d94b4b' };
    const css = document.createElement('style');
    css.id = 'bootCss';
    css.textContent = `
      #boot{position:fixed; inset:0; z-index:2147483000; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:22px;
        background:${c.bg}; color:${c.ink}; font:14px/1.4 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif; visibility:visible; transition:opacity .35s ease, background-color .35s ease;}
      #boot.out{opacity:0; pointer-events:none;}
      /* Modo silencioso: solo queda el fondo; nada de la verificación se ve */
      #boot.quiet .b-stage, #boot.quiet ul, #boot.quiet .b-text, #boot.quiet .b-err{visibility:hidden;}
      /* Ya se ve la pantalla de carga principal: el fondo se vuelve transparente y no estorba al ratón */
      #boot.clear{background-color:transparent; pointer-events:none;}
      #boot .b-stage{position:relative; display:grid; place-items:center; width:190px; height:190px;}
      #boot .b-ring{position:absolute; inset:0; width:100%; height:100%; transform:rotate(-90deg);}
      #boot .b-ring circle{fill:none; stroke-width:2.5;}
      #boot .b-bg{stroke:${c.line};}
      #boot .b-fg{stroke:${c.acc}; stroke-linecap:round; stroke-dasharray:339.292; stroke-dashoffset:339.292; transition:stroke-dashoffset .35s ease;}
      #boot.bad .b-fg{stroke:${c.bad};}
      #boot .b-logo{width:120px; height:120px; object-fit:contain;}
      #boot ul{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:9px; width:300px;}
      #boot li{display:flex; flex-wrap:wrap; align-items:center; gap:2px 10px; opacity:.45; color:${c.muted}; transition:opacity .3s, color .3s;}
      #boot li.on, #boot li.ok{opacity:1; color:${c.ink};}
      #boot li.fail{opacity:1; color:${c.bad};}
      #boot .b-ico{position:relative; flex:none; width:18px; height:18px;}
      #boot .b-ico::before{content:''; position:absolute; left:6px; top:6px; width:6px; height:6px; border-radius:50%; background:currentColor; opacity:.6;}
      #boot li.on .b-ico::before{inset:1px; left:1px; top:1px; width:auto; height:auto; background:none; opacity:1; border:2px solid ${c.line}; border-top-color:${c.acc}; animation:bootSpin .7s linear infinite;}
      #boot li.ok .b-ico::before{content:'✓'; inset:auto; left:2px; top:-2px; width:auto; height:auto; background:none; opacity:1; color:${c.acc}; font-weight:700; font-size:15px;}
      #boot li.fail .b-ico::before{content:'✗'; inset:auto; left:3px; top:-2px; width:auto; height:auto; background:none; opacity:1; color:${c.bad}; font-weight:700; font-size:15px;}
      @keyframes bootSpin{to{transform:rotate(360deg);}}
      #boot .b-name{flex:1; font-weight:500;}
      #boot .b-det{font-size:12px; color:${c.muted}; font-variant-numeric:tabular-nums;}
      #boot .b-where{flex-basis:100%; margin-left:28px; height:13px; font:11px/13px ui-monospace, Consolas, monospace; color:${c.muted}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
      #boot li.fail .b-where{color:${c.bad};}
      #boot .b-text{min-height:18px; font-size:13px; letter-spacing:.1em; text-transform:uppercase; color:${c.muted}; text-align:center;}
      #boot.bad .b-text{color:${c.bad};}
      #boot .b-err{max-width:min(420px, 86vw); text-align:center; color:${c.muted};}
      #boot .b-err b{display:block; margin-bottom:4px; font-size:16px; color:${c.ink};}
      #boot .b-btn{margin-top:12px; padding:10px 22px; border:0; border-radius:999px; background:${c.acc}; color:${c.bg}; font:600 14px inherit; cursor:pointer;}
      @media (prefers-reduced-motion:reduce){ #boot, #boot .b-fg{transition:none;} #boot li.on .b-ico::before{animation:none;} }`;
    document.head.append(css);

    const el = document.createElement('div');
    el.id = 'boot';
    el.className = 'quiet';
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="b-stage"><svg class="b-ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="b-bg" cx="60" cy="60" r="54"></circle><circle class="b-fg" cx="60" cy="60" r="54"></circle></svg><img class="b-logo" src="images/Logo.png" alt="" width="120" height="120"></div><ul></ul><div class="b-text">Preparando</div>';
    el.querySelector('.b-logo').addEventListener('error', e => { e.target.style.display = 'none'; });
    document.body.append(el);
    const ring = el.querySelector('.b-fg'), list = el.querySelector('ul'), text = el.querySelector('.b-text');
    const LEN = 339.292;

    const rows = {};
    const row = (id, name) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="b-ico"></span><span class="b-name"></span><span class="b-det"></span><span class="b-where"></span>';
      li.querySelector('.b-name').textContent = name;
      list.append(li);
      const api = {
        state: s => { li.className = s; },
        det: t => { li.querySelector('.b-det').textContent = t; },
        where: t => { li.querySelector('.b-where').textContent = t; }
      };
      return rows[id] = api;
    };
    return {
      row, rows,
      progress: f => { ring.style.strokeDashoffset = String(LEN * (1 - Math.max(0, Math.min(1, f)))); },
      text: t => { text.textContent = t; },
      // Estilos listos: se destapa la pantalla de carga principal (este fondo se vuelve transparente)
      clear(){ el.classList.add('clear'); },
      fail(title, msg, canRetry){
        el.classList.remove('quiet', 'clear');   // solo ante un error esta pantalla se hace visible
        el.classList.add('bad');
        text.textContent = 'No se pudo iniciar';
        const e = document.createElement('div');
        e.className = 'b-err';
        const b = document.createElement('b'); b.textContent = title;
        e.append(b, document.createTextNode(msg));
        if(canRetry){
          const btn = document.createElement('button');
          btn.className = 'b-btn'; btn.type = 'button'; btn.textContent = 'Reintentar';
          btn.addEventListener('click', () => location.reload());
          e.append(document.createElement('br'), btn);
        }
        el.append(e);
      },
      close(){ el.classList.add('out'); setTimeout(() => { el.remove(); css.remove(); }, 400); }
    };
  }

  /* ---------- Todo junto ---------- */
  (async () => {
    // Ctrl + R / Ctrl + X: igual que en la página, recargan saltándose la pantalla de carga
    const keys = e => {
      if(!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if(k !== 'r' && k !== 'x') return;
      e.preventDefault(); e.stopImmediatePropagation();
      if(e.repeat) return;
      try{ sessionStorage.setItem('akon_skip_intro', '1'); if(k === 'x') sessionStorage.setItem('akon_skip_offline', '1'); }catch(err){}
      location.reload();
    };
    document.addEventListener('keydown', keys, true);

    const dev = detectDevice();
    const part = dev.mobile ? 'mov' : 'pc';

    if(fast){                                      // sin pantalla de carga ni verificaciones: directo a cargar
      try{ await download(part); showIntro(); }
      catch(e){ revealPage(); }                    // si falla, la página muestra su propio error
      document.removeEventListener('keydown', keys, true);
      return;
    }

    const ui = buildBoot();
    await clearCaches();                           // 1) al empezar: se borra el caché (también forma parte de la verificación)

    const names = [...FILES.pc, ...FILES.mov];
    const all = ui.row('files', 'Archivos');
    const dv  = ui.row('dev', 'Dispositivo');
    let dl = null;                                 // la fila "Descarga" solo existe DESPUÉS de que la verificación llegue al 100 %
    ui.progress(.02);

    try{
      // 2) ¿existen los archivos de PC y de celular? (solo el nombre; no se descargan)
      all.state('on'); all.det('0/' + names.length); all.where('buscando…');
      let found = 0;
      const results = await Promise.all(names.map(async n => {
        const ok = await exists(n);
        if(ok) { found++; all.det(found + '/' + names.length); ui.progress(.05 + .25 * found / names.length); }
        return { n, ok };
      }));
      if(results.some(r => r.ok === null)){
        all.state('fail'); all.where('sin conexión');
        ui.fail('Sin conexión a internet', 'Revisa tu cable o tu Wi-Fi. Cuando vuelva el internet, la página se abre sola. O pulsa Ctrl + X para entrar sin internet.', false);
        window.addEventListener('online', () => location.reload(), { once: true });
        return;
      }
      const missing = results.filter(r => !r.ok).map(r => r.n);
      if(missing.length){
        all.state('fail'); all.det('faltan ' + missing.length); all.where('falta: ' + missing.join(', '));
        ui.fail('Parece que algo se perdió', 'Falta: ' + missing.join(', ') + '. AKON Search necesita los archivos de computadora y de celular.', true);
        return;
      }
      all.state('ok'); all.det('encontrados'); all.where(names.join(' · '));
      ui.progress(.7);

      // 3) ¿celular o computadora?
      dv.state('ok'); dv.det(dev.mobile ? 'Móvil' : 'Computadora'); dv.where(dev.how);
      root.dataset.device = dev.mobile ? 'mobile' : 'pc';

      // La verificación termina AQUÍ, al 100 %. Hasta este punto no se ha descargado ningún archivo.
      ui.progress(1);
      ui.text('Verificado');

      // 4) Solo ahora empieza la descarga, y únicamente de los archivos de ese dispositivo
      dl = ui.row('down', 'Descarga');
      dl.state('on'); dl.det('estilos'); dl.where(FILES[part][0]);
      ui.text('Descargando');
      await loadCss(FILES[part][0]);

      dl.det('scripts'); dl.where(FILES[part][1]);
      await loadJs(FILES[part][1]);                // aquí la página construye su pantalla de carga principal
      dl.state('ok'); dl.det('listo'); dl.where(FILES[part].join(' · '));

      // Pantalla de carga principal ya construida: se muestra, y la de verificación se vuelve transparente.
      showIntro();
      ui.clear();
    }catch(e){
      if(!dl) dl = ui.row('down', 'Descarga');
      dl.state('fail'); dl.det('error'); dl.where(String(e && e.message || e).slice(0, 80));
      ui.fail('No se pudo descargar', 'No se pudo cargar el archivo: ' + String(e && e.message || e).slice(0, 80), true);
      return;
    }
    document.removeEventListener('keydown', keys, true);
    ui.close();
  })();
})();