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
    return { b, c1: P.c1, base: (i / ids.length) * Math.PI * 2 };
  });
  let paused = false, angle = 0, last = performance.now(), W = 0, H = 0, dpr = 1;
  nav.addEventListener("pointerenter", () => (paused = true));
  nav.addEventListener("pointerleave", () => (paused = false));
  nav.addEventListener("focusin", () => (paused = true));
  nav.addEventListener("focusout", () => (paused = false));
  // 50 numéros en orbite lointaine (les numéros du dernier tirage brillent)
  const dust = Array.from({ length: 50 }, (_, i) => ({ n: i + 1, a: (i / 50) * Math.PI * 2, ring: i % 2 }));
  // Paillettes fines : poussière d'or en bande le long de l'orbite, reflets en croix très fins,
  // traînées de lumière derrière les planètes.
  const PAL = ["255,250,240", "255,226,170", "214,244,255", "232,220,255"];
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  const dustF = Array.from({ length: 320 }, () => ({
    a: Math.random() * Math.PI * 2, R: 1 + gauss() * 0.075, dy: gauss() * 7,
    sp: 0.85 + Math.random() * 0.3, ph: Math.random() * Math.PI * 2, tw: 0.3 + Math.random() * 1.2,
    sz: 0.35 + Math.random() ** 3 * 0.9, c: PAL[(Math.random() * PAL.length) | 0],
  }));
  let glints = [], motes = [];
  function cross(x, y, L, al, c) {
    ctx.globalAlpha = al; ctx.lineWidth = 0.6; ctx.lineCap = "round";
    for (const [dx, dy, l] of [[1, 0, L], [0, 1, L], [0.7071, 0.7071, L * 0.38], [0.7071, -0.7071, L * 0.38]]) {
      const g = ctx.createLinearGradient(x - dx * l, y - dy * l, x + dx * l, y + dy * l);
      g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(0.5, `rgba(${c},1)`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(x - dx * l, y - dy * l); ctx.lineTo(x + dx * l, y + dy * l); ctx.stroke();
    }
    ctx.fillStyle = `rgba(${c},1)`; ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill();
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
    // paillettes fines
    ctx.globalCompositeOperation = "lighter";
    const sec = t / 1000;
    for (const p of dustF) {
      const a = p.a + angle * p.sp;
      const x = cx + Math.cos(a) * rx * p.R, y = cy + Math.sin(a) * ry * p.R + p.dy;
      const tw = reduce ? 0.6 : 0.5 + 0.5 * Math.sin(sec * p.tw + p.ph);
      ctx.globalAlpha = (0.12 + 0.75 * tw * tw) * (Math.sin(a) > 0 ? 1 : 0.5);
      ctx.fillStyle = `rgb(${p.c})`;
      ctx.beginPath(); ctx.arc(x, y, p.sz, 0, Math.PI * 2); ctx.fill();
      p.x = x; p.y = y;
    }
    if (!reduce) {
      // reflets : quelques grains s'allument brièvement en croix fine
      if (glints.length < (W < 600 ? 4 : 7) && Math.random() < 0.05) {
        const p = dustF[(Math.random() * dustF.length) | 0];
        glints.push({ p, life: 0, dur: 1.4 + Math.random() * 1.4, L: 4 + Math.random() * 7 });
      }
      glints = glints.filter(g => (g.life += dt / 1000) < g.dur);
      for (const g of glints) cross(g.p.x, g.p.y, g.L, Math.sin(Math.PI * g.life / g.dur) ** 2 * 0.9, g.p.c);
      // traînées : arc lumineux qui s'éteint derrière chaque planète + grains qui s'en détachent
      for (const pl of els) {
        const a0 = pl.base + angle, depth = (Math.sin(a0) + 1) / 2, N = 22, span = 0.42;
        ctx.strokeStyle = pl.c1;
        for (let i = 0; i < N; i++) {
          const u = i / N, a1 = a0 - 0.07 - u * span, a2 = a0 - 0.07 - (u + 1 / N) * span;
          ctx.globalAlpha = (1 - u) ** 2 * (0.35 + 0.4 * depth); ctx.lineWidth = 1.6 * (1 - u) + 0.2;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry); ctx.lineTo(cx + Math.cos(a2) * rx, cy + Math.sin(a2) * ry); ctx.stroke();
        }
        if (Math.random() < 0.12) {
          const a = a0 - 0.08 - Math.random() * 0.2;
          motes.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, vx: (Math.random() - 0.5) * 0.008, vy: 0.004 + Math.random() * 0.008, life: 1, c: PAL[(Math.random() * PAL.length) | 0] });
        }
      }
      motes = motes.filter(m => (m.life -= dt / 2600) > 0);
      for (const m of motes) {
        m.x += m.vx * dt; m.y += m.vy * dt;
        ctx.globalAlpha = m.life * 0.9; ctx.fillStyle = `rgb(${m.c})`;
        ctx.beginPath(); ctx.arc(m.x, m.y, 0.3 + 0.6 * m.life, 0, Math.PI * 2); ctx.fill();
      }
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
