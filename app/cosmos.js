// Univers visuel : ciel étoilé animé + système orbital servant de menu principal.
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- ciel étoilé (plein écran, derrière tout) ----------
export function startSky(canvas) {
  const ctx = canvas.getContext("2d");
  let W, H, stars = [], shooting = null;
  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = canvas.width = innerWidth * dpr; H = canvas.height = innerHeight * dpr;
    const n = Math.round((innerWidth * innerHeight) / 4500);
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: (Math.random() ** 3 * 1.6 + 0.3) * dpr,
      p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() * 1.6,
      c: Math.random() < 0.15 ? "180,200,255" : Math.random() < 0.1 ? "255,200,230" : "255,255,255",
    }));
  }
  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      const a = reduce ? 0.7 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 1000 * s.s + s.p));
      ctx.fillStyle = `rgba(${s.c},${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    if (!reduce) {
      if (!shooting && Math.random() < 0.003) shooting = { x: Math.random() * W * 0.7, y: Math.random() * H * 0.4, life: 0 };
      if (shooting) {
        const L = shooting.life, x = shooting.x + L * 9, y = shooting.y + L * 4;
        const g = ctx.createLinearGradient(x - 90, y - 40, x, y);
        g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, `rgba(200,230,255,${1 - L / 60})`);
        ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 90, y - 40); ctx.lineTo(x, y); ctx.stroke();
        if (++shooting.life > 60) shooting = null;
      }
      requestAnimationFrame(frame);
    }
  }
  resize(); addEventListener("resize", resize);
  requestAnimationFrame(frame);
}

// ---------- système orbital ----------
const PLANETS = {
  semaine: { short: "Semaine", lbl: "Grilles de la semaine", c1: "#ffd27a", c2: "#c46a00", ringed: true },
  tribunal: { short: "Tribunal", lbl: "Tribunal", c1: "#b9a6ff", c2: "#5a2fd6" },
  public: { short: "Public", lbl: "Ce que joue le public", c1: "#ff8fc4", c2: "#b0186a" },
  stats: { short: "Stats", lbl: "Statistiques", c1: "#7fe9ff", c2: "#0b7ea8" },
  generateur: { short: "Générateur", lbl: "Générateur", c1: "#8fb1ff", c2: "#2a46c9", ringed: true },
  recouvrement: { short: "Systèmes", lbl: "Recouvrement", c1: "#7dffd6", c2: "#0d8a6a" },
  couts: { short: "Coûts", lbl: "Coûts", c1: "#ffad85", c2: "#c2410c" },
  budget: { short: "Budget", lbl: "Budget", c1: "#9dff9a", c2: "#1f8a2c" },
  historique: { short: "Historique", lbl: "Historique", c1: "#d6dcff", c2: "#4b5280" },
};

export function startOrbit({ hero, canvas, nav, ids, onSelect, highlight = [] }) {
  const ctx = canvas.getContext("2d");
  const els = ids.map((id, i) => {
    const P = PLANETS[id] || { lbl: id, c1: "#ccc", c2: "#555" };
    const b = document.createElement("button");
    b.className = "planet"; b.dataset.tab = id; b.type = "button";
    b.style.setProperty("--c1", P.c1); b.style.setProperty("--c2", P.c2);
    b.innerHTML = `<span class="orb${P.ringed ? " ringed" : ""}"></span><span class="lbl"><span class="long">${P.lbl}</span><span class="short">${P.short || P.lbl}</span></span>`;
    b.setAttribute("aria-label", P.lbl);
    b.addEventListener("click", () => onSelect(id));
    nav.appendChild(b);
    return { b, base: (i / ids.length) * Math.PI * 2 };
  });
  let paused = false, angle = 0, last = performance.now(), W = 0, H = 0, dpr = 1;
  nav.addEventListener("pointerenter", () => (paused = true));
  nav.addEventListener("pointerleave", () => (paused = false));
  nav.addEventListener("focusin", () => (paused = true));
  nav.addEventListener("focusout", () => (paused = false));
  // 50 numéros en orbite lointaine (les numéros du dernier tirage brillent)
  const dust = Array.from({ length: 50 }, (_, i) => ({ n: i + 1, a: (i / 50) * Math.PI * 2, ring: i % 2 }));
  // Paillettes : éclats scintillants autour de l'orbite + traînée derrière les planètes
  const PAL = ["255,255,255", "191,246,255", "255,214,130", "255,170,215", "200,185,255"];
  const glitter = Array.from({ length: 70 }, () => ({
    a: Math.random() * Math.PI * 2, R: 0.82 + Math.random() * 0.62, sp: 0.4 + Math.random() * 1.1,
    ph: Math.random() * Math.PI * 2, tw: 0.6 + Math.random() * 2.2, sz: 1.6 + Math.random() ** 2 * 5.5,
    c: PAL[(Math.random() * PAL.length) | 0], dy: (Math.random() - 0.5) * 18,
  }));
  let trail = [];
  function glint(x, y, r, alpha, c) {
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    g.addColorStop(0, `rgba(${c},0.9)`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgb(${c})`; ctx.beginPath();
    ctx.moveTo(x, y - r * 2.4); ctx.quadraticCurveTo(x, y, x + r * 2.4, y); ctx.quadraticCurveTo(x, y, x, y + r * 2.4);
    ctx.quadraticCurveTo(x, y, x - r * 2.4, y); ctx.quadraticCurveTo(x, y, x, y - r * 2.4); ctx.fill();
  }
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = hero.clientWidth; H = hero.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
  }
  function geom() {
    const cx = W / 2, cy = H * 0.44;
    const rx = Math.min(W * (W < 600 ? 0.38 : 0.42), 430);
    const ry = Math.max(56, Math.min(rx * (W < 600 ? 0.66 : 0.36), H - 96 - cy - 34)); // laisse la place au dernier tirage en bas
    hero.style.setProperty("--cy", cy + "px");
    return { cx, cy, rx, ry };
  }
  function draw(t) {
    const dt = Math.min(64, t - last); last = t;
    if (!paused && !reduce) angle += dt * 0.00012;
    const { cx, cy, rx, ry } = geom();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // anneaux de poussière numérotée
    const hl = new Set(highlight);
    for (const d of dust) {
      const R = d.ring ? 1.32 : 1.18, a = d.a - angle * (d.ring ? 0.6 : 0.9);
      const x = cx + Math.cos(a) * rx * R, y = cy + Math.sin(a) * ry * R * 1.05;
      const front = Math.sin(a) > 0, hot = hl.has(d.n);
      ctx.globalAlpha = (front ? 0.85 : 0.35) * (hot ? 1 : 0.55);
      ctx.fillStyle = hot ? "#2fd9f5" : "#aab4ff";
      ctx.beginPath(); ctx.arc(x, y, hot ? 3.4 : 1.8, 0, Math.PI * 2); ctx.fill();
      if (hot || W > 700) {
        ctx.font = `${hot ? 700 : 500} ${hot ? 11 : 9}px Manrope, system-ui, sans-serif`;
        ctx.fillStyle = hot ? "#bff6ff" : "#8a8ec4"; ctx.textAlign = "center";
        ctx.fillText(d.n, x, y - 6);
      }
    }
    ctx.globalAlpha = 1;
    // orbite principale
    const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    g.addColorStop(0, "rgba(255,95,168,0.55)"); g.addColorStop(0.5, "rgba(139,108,255,0.7)"); g.addColorStop(1, "rgba(47,217,245,0.55)");
    ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.shadowColor = "rgba(139,108,255,0.9)"; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    // paillettes
    ctx.globalCompositeOperation = "lighter";
    const k = W < 600 ? 0.75 : 1;
    for (const p of glitter) {
      const a = p.a + angle * p.sp;
      const x = cx + Math.cos(a) * rx * p.R, y = cy + Math.sin(a) * ry * p.R + p.dy;
      const tw = reduce ? 0.5 : Math.max(0, Math.sin(t / 1000 * p.tw + p.ph));
      const al = tw ** 3 * (Math.sin(a) > 0 ? 1 : 0.55);
      if (al > 0.02) glint(x, y, p.sz * k * (0.55 + 0.45 * tw), al, p.c);
    }
    if (!reduce) {
      for (const pl of els) if (Math.random() < 0.35) {
        const a = pl.base + angle - 0.05 - Math.random() * 0.12;
        trail.push({ x: cx + Math.cos(a) * rx + (Math.random() - 0.5) * 10, y: cy + Math.sin(a) * ry + (Math.random() - 0.5) * 10,
          life: 1, sz: 0.8 + Math.random() * 1.8, c: PAL[(Math.random() * PAL.length) | 0] });
      }
      trail = trail.filter(q => (q.life -= dt / 1300) > 0);
      for (const q of trail) glint(q.x, q.y + (1 - q.life) * 6, q.sz * k, q.life * 0.8, q.c);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    // planètes : profondeur simulée (devant = plus grosses et au-dessus du noyau)
    for (const p of els) {
      const a = p.base + angle;
      const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      const depth = (Math.sin(a) + 1) / 2;                  // 0 derrière, 1 devant
      const sc = 0.72 + depth * 0.38;
      p.b.style.transform = `translate(${x}px, ${y}px) translate(-50%, -24px) scale(${sc})`;
      p.b.style.zIndex = depth > 0.5 ? 4 : 2;
      p.b.style.opacity = 0.55 + depth * 0.45;
    }
    if (!reduce) requestAnimationFrame(draw);
  }
  resize(); addEventListener("resize", () => { resize(); if (reduce) draw(performance.now()); });
  requestAnimationFrame(draw);
  return {
    setActive(id) { els.forEach(p => p.b.classList.toggle("on", p.b.dataset.tab === id)); },
    setHighlight(nums) { highlight = nums; },
  };
}
