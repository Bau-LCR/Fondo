(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     NEBULA  —  plasma de baja resolución escalado y difuminado
                z-index 0: debajo de estrellas, siempre activo
  ═══════════════════════════════════════════════════════════ */
  const ncv  = document.createElement('canvas');
  const nctx = ncv.getContext('2d');
  ncv.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;' +
    'z-index:0;pointer-events:none;';
  document.body.insertBefore(ncv, document.body.firstChild);

  /* Buffer de baja resolución para el plasma (muy rápido de computar) */
  const PW = 128, PH = 72;
  const pbuf  = document.createElement('canvas');
  pbuf.width  = PW;
  pbuf.height = PH;
  const pctx  = pbuf.getContext('2d');
  const pImg  = pctx.createImageData(PW, PH);
  const pArr  = pImg.data;

  /* ═══════════════════════════════════════════════════════════
     WARP  —  z-index 4: sobre nodos/partículas, bajo el orb
  ═══════════════════════════════════════════════════════════ */
  const wcv  = document.createElement('canvas');
  const wctx = wcv.getContext('2d');
  wcv.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;' +
    'z-index:4;pointer-events:none;';
  document.body.appendChild(wcv);

  let W, H;
  function resize() {
    W = ncv.width = wcv.width   = window.innerWidth;
    H = ncv.height = wcv.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── Paleta de color (índigo profundo → azul → cian) ── */
  const STOPS = [
    [  3,   5,  38],  // 0.00  espacio profundo
    [  8,  20, 100],  // 0.20  azul marino
    [ 15,  55, 185],  // 0.40  azul real
    [ 35, 118, 255],  // 0.60  azul eléctrico
    [ 85, 180, 255],  // 0.80  cian
    [195, 228, 255],  // 1.00  blanco-azul
  ];
  function colorRamp(v) {          /* v ∈ [−1, 1] */
    const n  = Math.max(0, Math.min(1, (v + 1) * 0.5));
    const fi = n * (STOPS.length - 1);
    const i0 = fi | 0;
    const i1 = Math.min(i0 + 1, STOPS.length - 1);
    const f  = fi - i0;
    const a  = STOPS[i0], b = STOPS[i1];
    return [
      (a[0] + (b[0] - a[0]) * f) | 0,
      (a[1] + (b[1] - a[1]) * f) | 0,
      (a[2] + (b[2] - a[2]) * f) | 0,
    ];
  }

  /* ── Plasma ── */
  let t    = 0;
  let skip = 0;

  function computeNebula(warpBoost) {
    for (let y = 0; y < PH; y++) {
      const ny = y / PH;
      for (let x = 0; x < PW; x++) {
        const nx = x / PW;
        const v  =
          Math.sin(nx * 8.5  + t * 0.52) * 0.38 +
          Math.sin(ny * 6.2  + t * 0.68) * 0.30 +
          Math.sin((nx + ny) * 6.8 + t * 0.31) * 0.32;
        const [r, g, b] = colorRamp(v);
        const i = (y * PW + x) * 4;
        pArr[i]   = r;
        pArr[i+1] = g;
        pArr[i+2] = b;
        pArr[i+3] = 255;
      }
    }
    pctx.putImageData(pImg, 0, 0);

    const opacity = 0.13 + warpBoost * 0.12;   // brilla más durante el warp
    nctx.clearRect(0, 0, W, H);
    nctx.globalAlpha = opacity;
    nctx.filter = 'blur(20px)';
    nctx.drawImage(pbuf, 0, 0, W, H);
    nctx.filter = 'none';
    nctx.globalAlpha = 1;
  }

  /* ════════════════════════════════════════════
     HYPERSPACE WARP
  ════════════════════════════════════════════ */
  const WARP_EVERY = 45000;   // ms entre saltos
  const WARP_DUR   = 3800;    // ms de duración total

  let streaks  = [];
  let warpT0   = -1e9;        // timestamp de inicio del warp activo
  let lastWarp = Date.now();
  let nextWarp = 22000 + Math.random() * 10000;   // primer warp a los 22–32 s

  function buildStreaks() {
    streaks = Array.from({ length: 220 }, () => ({
      a:    Math.random() * Math.PI * 2,
      r0:   55  + Math.random() * 190,
      rEnd: 360 + Math.random() * 820,
      len:  28  + Math.random() * 115,
      w:    0.4 + Math.random() * 2.4,
      hue:  192 + Math.random() * 32,
      lit:  62  + Math.random() * 30,
    }));
  }

  /* ease-in-out cúbico */
  function eio(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function drawWarp(phase) {      /* phase: 0 → 1 → 0 */
    wctx.clearRect(0, 0, W, H);
    if (phase < 0.005) return;

    const e  = eio(phase);
    const cx = W / 2, cy = H / 2;

    /* ── Carga previa: pulso de borde antes del salto ── */
    if (phase < 0.25) {
      const ca = Math.sin((phase / 0.25) * Math.PI) * 0.18;
      const cg = wctx.createRadialGradient(cx, cy, H * 0.4, cx, cy, Math.max(W, H) * 0.85);
      cg.addColorStop(0, 'rgba(0,0,0,0)');
      cg.addColorStop(1, `rgba(55,120,255,${ca})`);
      wctx.fillStyle = cg;
      wctx.fillRect(0, 0, W, H);
    }

    /* ── Trazos de velocidad ── */
    for (const s of streaks) {
      const r   = s.r0 + e * (s.rEnd - s.r0);
      const len = s.len * (0.12 + e * 3.6);
      const x1  = cx + Math.cos(s.a) * r;
      const y1  = cy + Math.sin(s.a) * r;
      const x2  = cx + Math.cos(s.a) * (r + len);
      const y2  = cy + Math.sin(s.a) * (r + len);
      const a   = Math.min(e * 3, 1) * 0.82;

      const g = wctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0.00, `hsla(${s.hue},100%,${s.lit}%,0)`);
      g.addColorStop(0.12, `hsla(${s.hue},100%,${s.lit}%,${a})`);
      g.addColorStop(1.00, `hsla(${s.hue},100%,92%,0)`);
      wctx.beginPath();
      wctx.moveTo(x1, y1);
      wctx.lineTo(x2, y2);
      wctx.strokeStyle = g;
      wctx.lineWidth   = s.w * (0.25 + e * 2.8);
      wctx.stroke();
    }

    /* ── Bloom central ── */
    const bE = Math.max(0, e - 0.06);
    if (bE > 0) {
      const ba = bE * 0.30;
      const bg = wctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.52);
      bg.addColorStop(0.00, `rgba(215,238,255,${ba})`);
      bg.addColorStop(0.22, `rgba( 75,148,255,${ba * 0.75})`);
      bg.addColorStop(0.55, `rgba( 18, 62,215,${ba * 0.30})`);
      bg.addColorStop(1.00, 'rgba(0,0,0,0)');
      wctx.fillStyle = bg;
      wctx.fillRect(0, 0, W, H);
    }

    /* ── Flash en el pico del salto ── */
    if (phase > 0.88 && phase <= 1) {
      const fA = Math.sin(((phase - 0.88) / 0.12) * Math.PI) * 0.28;
      wctx.fillStyle = `rgba(185,225,255,${fA})`;
      wctx.fillRect(0, 0, W, H);
    }
  }

  /* ════════════════════════════════════════════
     LOOP PRINCIPAL
  ════════════════════════════════════════════ */
  let rafLast    = 0;
  let warpActive = false;

  function frame(ts) {
    const dt = Math.min(ts - rafLast, 50);
    rafLast  = ts;
    t       += dt * 0.00055;      // drift muy lento de la nebulosa

    const now       = Date.now();
    const sinceLast = now - lastWarp;

    /* ── Disparar warp ── */
    if (sinceLast >= nextWarp && (now - warpT0) > WARP_DUR + 1200) {
      warpT0   = now;
      lastWarp = now;
      nextWarp = WARP_EVERY + Math.random() * 16000;
      buildStreaks();
    }

    /* ── Calcular fase del warp ── */
    const we    = now - warpT0;
    let wPhase  = 0;
    warpActive  = we >= 0 && we < WARP_DUR;
    if (warpActive) {
      wPhase = we < WARP_DUR / 2
        ? we / (WARP_DUR / 2)
        : 1 - (we - WARP_DUR / 2) / (WARP_DUR / 2);
    }

    /* ── Nebulosa (cada 3 frames → ~20 fps, suficiente con blur) ── */
    if (skip++ % 3 === 0) computeNebula(warpActive ? eio(wPhase) : 0);

    /* ── Warp ── */
    if (warpActive) {
      drawWarp(wPhase);
    } else {
      wctx.clearRect(0, 0, W, H);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
