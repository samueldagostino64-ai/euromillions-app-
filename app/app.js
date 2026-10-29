import * as E from "./core.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const eur = v => v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const pct = v => (v * 100).toLocaleString("fr-FR", { maximumFractionDigits: v < 0.01 ? 4 : 1 }) + " %";
const oneIn = p => (p > 0 ? "1 sur " + Math.round(1 / p).toLocaleString("fr-FR") : "–");
const fmtDate = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

// ---------- état ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem("em." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("em." + k, JSON.stringify(v)); } catch { /* navigation privée */ } },
};
let DRAWS = [], STATS = null, CONFIG = {}, lastGen = [], genSeed = 1;
const settings = () => ({ budgetWeek: 10, budgetMonth: 45, drawsPerWeek: 2, mode: "mix", pauseUntil: "", ...CONFIG, ...store.get("settings", {}) });
const journal = () => store.get("journal", []);

// ---------- rendu de base ----------
function balls(g, hits = null) {
  const h = hits ? new Set(hits.n) : null, hs = hits ? new Set(hits.s) : null;
  return `<span class="balls">${g.n.map(x => `<span class="ball${h && h.has(x) ? " hit" : ""}">${x}</span>`).join("")}${(g.s || []).map(x => `<span class="ball star${hs && hs.has(x) ? " hit" : ""}"><span>${x}</span></span>`).join("")}</span>`;
}
function popTag(score) {
  const cls = score <= 10 ? "good" : score <= 25 ? "warn" : "bad";
  const txt = score <= 10 ? "peu jouée" : score <= 25 ? "moyennement jouée" : "très jouée";
  return `<span class="tag ${cls}" title="Score de popularité ${score}/100">${txt} · ${score}</span>`;
}
function gridList(grids) {
  const past = E.pastSetsOf(DRAWS);
  return grids.map((g, i) => {
    const p = E.popularity(g.n, g.s, past);
    return `<div class="grille"><span class="muted">#${i + 1}</span>${balls(g)}${popTag(p.score)}</div>`;
  }).join("");
}

// ---------- graphiques SVG (barres) ----------
const tip = $("#tip");
function bars(el, values, labels, { alt = false, highlight = null, fmt = v => v } = {}) {
  const W = Math.max(300, el.clientWidth || 760), H = 200, pad = 24, n = values.length, max = Math.max(...values, 1);
  const bw = (W - pad) / n;
  const ticks = [0, 0.5, 1].map(f => Math.round(max * f));
  let s = `<svg viewBox="0 0 ${W} ${H + 18}" role="img">`;
  for (const t of ticks) { const y = H - (t / max) * (H - 10); s += `<line class="gridline" x1="${pad}" x2="${W}" y1="${y}" y2="${y}"/><text x="0" y="${y + 3}">${t}</text>`; }
  values.forEach((v, i) => {
    const h = Math.max(1, (v / max) * (H - 10)), x = pad + i * bw + 1, w = Math.max(1, bw - 2), y = H - h;
    const r = Math.min(4, w / 2);
    const isHi = highlight && highlight.includes(i);
    s += `<path class="bar${alt || isHi ? " alt" : ""}" data-tip="${labels[i]} : ${fmt(v)}" d="M${x},${H}V${y + r}a${r},${r} 0 0 1 ${r},-${r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}V${H}Z"/>`;
    if (bw >= 14 || (bw >= 9 ? i % 2 === 0 : (i + 1) % 5 === 0 || i === 0)) s += `<text x="${x + w / 2}" y="${H + 14}" text-anchor="middle">${labels[i]}</text>`;
  });
  el.innerHTML = s + "</svg>";
}
document.addEventListener("mousemove", e => {
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!t) { tip.hidden = true; return; }
  tip.hidden = false; tip.textContent = t.dataset.tip;
  tip.style.left = Math.min(innerWidth - 160, e.clientX + 12) + "px"; tip.style.top = (e.clientY + 12) + "px";
});

// ---------- onglets ----------
$$(".tabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
function showTab(id) {
  $$(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === id));
  $$(".tab").forEach(t => (t.hidden = t.id !== id));
  if (id === "stats" && STATS) renderStats();
  try { sessionStorage.setItem("em.tab", id); } catch { /* ignore */ }
}

// ---------- budget ----------
function weekStart(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function spent() {
  const j = journal(), ws = weekStart(), now = new Date();
  const inWeek = j.filter(e => new Date(e.date + "T12:00:00") >= ws);
  const inMonth = j.filter(e => { const d = new Date(e.date + "T12:00:00"); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const sum = (a, k) => a.reduce((s, e) => s + (+e[k] || 0), 0);
  // semaines consécutives au-dessus du budget
  let streak = 0;
  for (let k = 0; k < 8; k++) {
    const a = new Date(ws); a.setDate(a.getDate() - 7 * k);
    const b = new Date(a); b.setDate(b.getDate() + 7);
    const st = sum(j.filter(e => { const d = new Date(e.date + "T12:00:00"); return d >= a && d < b; }), "stake");
    if (st > settings().budgetWeek) streak++; else break;
  }
  return { week: sum(inWeek, "stake"), month: sum(inMonth, "stake"), totalStake: sum(j, "stake"), totalWin: sum(j, "win"), streak };
}
function paused() { const p = settings().pauseUntil; return p && new Date(p + "T23:59:59") >= new Date() ? p : null; }
function renderBudgetPill() {
  const s = settings(), sp = spent();
  const el = $("#budget-pill");
  el.textContent = paused() ? `En pause jusqu'au ${new Date(paused()).toLocaleDateString("fr-FR")}` : `Semaine : ${eur(sp.week)} / ${eur(s.budgetWeek)}`;
  el.classList.toggle("over", sp.week > s.budgetWeek || !!paused());
}
function budgetCheck(cost) {
  const s = settings(), sp = spent();
  if (paused()) return `<div class="alert">Tu t'es mis en pause jusqu'au ${new Date(paused()).toLocaleDateString("fr-FR")}. Respecte ta décision.</div>`;
  const left = s.budgetWeek - sp.week, leftM = s.budgetMonth - sp.month;
  if (cost > left + 1e-9 || cost > leftM + 1e-9)
    return `<div class="alert">Hors cadre : cette formule coûte ${eur(cost)} alors qu'il te reste ${eur(Math.max(0, left))} cette semaine et ${eur(Math.max(0, leftM))} ce mois-ci. Réduis le nombre de grilles ou attends la semaine prochaine.</div>`;
  return `<div class="ok">Dans ton cadre : il te restera ${eur(left - cost)} cette semaine.</div>`;
}
function logStake(amount, note) {
  if (paused() && !confirm("Tu es en pause. Enregistrer quand même ?")) return;
  const s = settings(), sp = spent();
  if (sp.week + amount > s.budgetWeek && !confirm(`Ça te fait ${eur(sp.week + amount)} cette semaine pour un budget de ${eur(s.budgetWeek)}. Tu confirmes ?`)) return;
  const j = journal();
  j.push({ date: new Date().toISOString().slice(0, 10), stake: amount, win: 0, note });
  store.set("journal", j);
  renderBudget();
}

function renderBudget() {
  const s = settings(), sp = spent();
  $("#b-week").value = s.budgetWeek; $("#b-month").value = s.budgetMonth; $("#b-dpw").value = s.drawsPerWeek;
  $("#b-mode").value = s.mode; $("#b-pause").value = s.pauseUntil || "";
  const net = sp.totalWin - sp.totalStake;
  $("#b-kpis").innerHTML = [
    ["Dépensé cette semaine", eur(sp.week), sp.week > s.budgetWeek ? "bad" : ""],
    ["Dépensé ce mois", eur(sp.month), sp.month > s.budgetMonth ? "bad" : ""],
    ["Total misé", eur(sp.totalStake), ""],
    ["Total gagné", eur(sp.totalWin), ""],
    ["Bilan net", eur(net), net >= 0 ? "good" : "bad"],
  ].map(([l, v, c]) => `<div class="kpi ${c}"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("")
    + (sp.streak >= 2 ? `<div class="kpi bad" style="grid-column:1/-1"><div class="l">Alerte</div>Tu as dépassé ton budget ${sp.streak} semaines de suite. Ce n'est plus du cadrage, c'est une dérive. Pause d'une semaine conseillée.</div>` : "");
  const j = journal();
  $("#j-table").innerHTML = j.length ? `<table><tr><th>Date</th><th class="num">Mise</th><th class="num">Gain</th><th>Note</th><th></th></tr>${j.map((e, i) => ({ e, i })).reverse().map(({ e, i }) =>
    `<tr><td>${e.date}</td><td class="num">${eur(+e.stake)}</td><td class="num">${eur(+e.win)}</td><td>${(e.note || "").replace(/</g, "&lt;")}</td><td><button data-del="${i}">Suppr.</button></td></tr>`).join("")}</table>` : `<p class="muted">Aucune entrée. Ajoute tes mises ici, ou depuis le générateur.</p>`;
  $$("#j-table [data-del]").forEach(b => b.addEventListener("click", () => { const a = journal(); a.splice(+b.dataset.del, 1); store.set("journal", a); renderBudget(); }));
  renderBudgetPill();
}
$("#b-save").addEventListener("click", () => {
  store.set("settings", { budgetWeek: +$("#b-week").value || 0, budgetMonth: +$("#b-month").value || 0, drawsPerWeek: +$("#b-dpw").value, mode: $("#b-mode").value, pauseUntil: $("#b-pause").value });
  renderBudget(); renderWeek();
});
$("#j-add").addEventListener("click", () => {
  const j = journal();
  j.push({ date: $("#j-date").value || new Date().toISOString().slice(0, 10), stake: +$("#j-stake").value || 0, win: +$("#j-win").value || 0, note: $("#j-note").value });
  store.set("journal", j); $("#j-stake").value = ""; $("#j-win").value = 0; $("#j-note").value = "";
  renderBudget();
});
$("#j-export").addEventListener("click", () => {
  const rows = [["date", "mise", "gain", "note"], ...journal().map(e => [e.date, e.stake, e.win, (e.note || "").replace(/;/g, ",")])];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(";")).join("\n")], { type: "text/csv" }));
  a.download = "journal-euromillions.csv"; a.click();
});

// ---------- grilles de la semaine ----------
function planHTML(p, best = false) {
  const extra = p.multiple ? `<div class="facts">Numéros : <b>${p.multiple.nums.join(" ")}</b> · Étoiles : <b>${p.multiple.stars.join(" ")}</b></div>`
    : p.wheel ? `<div class="facts">Sélection : <b>${p.wheel.selection.join(" ")}</b> · Étoiles : <b>${p.wheel.stars.join(" ")}</b></div>` : "";
  return `<div class="plan${best ? " best" : ""}">
    <h3>${p.title}${best ? ' <span class="tag good">recommandé</span>' : ""}</h3>
    <div class="facts">
      <span>Coût : <b>${eur(p.cost.perDraw)}</b>/tirage · <b>${eur(p.cost.perWeek)}</b>/semaine · ≈ <b>${eur(p.cost.perMonth)}</b>/mois</span>
      <span>Jackpot : <b>${oneIn(p.pJackpot)}</b> par tirage</span>
      <span>Au moins un gain : <b>${pct(p.sim.pAnyEP)}</b> par tirage</span>
    </div>
    <p class="muted">${p.note}</p>${extra}
    <details${best ? " open" : ""}><summary>Voir les ${p.grids.length} combinaison(s)</summary>${gridList(p.grids.slice(0, 60))}${p.grids.length > 60 ? `<p class="muted">… et ${p.grids.length - 60} autres (développement automatique de la grille multiple).</p>` : ""}</details>
  </div>`;
}
function renderWeek() {
  const s = settings(), wk = E.isoWeek();
  $("#week-title").textContent = `Grilles de la semaine ${wk.split("-W")[1]}`;
  $("#week-sub").textContent = `Budget ${eur(s.budgetWeek)}/semaine · ${s.drawsPerWeek === 2 ? "mardi + vendredi" : "1 tirage"} · stratégie ${s.mode}`;
  if (paused()) { $("#plans").innerHTML = budgetCheck(0); return; }
  if (s.budgetWeek / s.drawsPerWeek < E.PRICE) { $("#plans").innerHTML = `<div class="alert">Budget trop faible : il faut au moins ${eur(E.PRICE * s.drawsPerWeek)} par semaine pour ${s.drawsPerWeek} tirage(s).</div>`; return; }
  const plans = E.proposePlans({ budgetWeek: s.budgetWeek, drawsPerWeek: s.drawsPerWeek, stats: STATS, draws: DRAWS, mode: s.mode, seed: E.hashSeed(wk) });
  $("#plans").innerHTML = plans.map((p, i) => planHTML(p, i === 0)).join("")
    + `<p class="muted">Pourquoi les grilles simples anti-partage sont recommandées : à budget égal, toutes les formules ont la même chance de jackpot (nombre de combinaisons ÷ 139 838 160). Les grilles simples bien étalées maximisent la probabilité de gagner au moins quelque chose, et l'anti-partage maximise ce que tu touches si ça tombe.</p>`;
}

// ---------- statistiques ----------
let freqMode = "all";
function renderStats() {
  const S = STATS, last = DRAWS[DRAWS.length - 1];
  const next = nextDrawDate();
  $("#kpis").innerHTML = [
    [S.N.toLocaleString("fr-FR"), "tirages analysés"],
    [fmtDate(DRAWS[0].d), "premier tirage"],
    [fmtDate(last.d), "dernier tirage"],
    [next.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), "prochain tirage"],
  ].map(([v, l]) => `<div class="kpi"><div class="v" style="font-size:17px">${v}</div><div class="l">${l}</div></div>`).join("")
    + `<div class="kpi" style="grid-column:1/-1"><div class="l">Dernier tirage</div>${balls(last)}</div>`;
  const verdict = S.chi2p > 0.05
    ? "Les écarts de fréquence entre numéros sont exactement ceux qu'on attend du pur hasard. Les « numéros chauds » d'aujourd'hui ne sont pas plus probables demain."
    : "Les écarts sont un peu plus marqués que la moyenne, mais sur 50 numéros ça arrive par hasard : aucun numéro n'a de chance supérieure au prochain tirage.";
  $("#chi2").innerHTML = `<strong>Test d'honnêteté (khi-deux, ${S.N} tirages)</strong> : χ² = ${S.chi2.toFixed(1)} pour 49 degrés de liberté, p = ${S.chi2p.toFixed(2)}. ${verdict}`;
  renderFreq();
  const sl = Array.from({ length: 12 }, (_, i) => i + 1);
  bars($("#chart-star"), sl.map(s => S.starFreq[s]), sl, { alt: true, fmt: v => `${v} sorties` });
  const buckets = [], labels = [];
  for (let b = 10; b < 250; b += 10) { buckets.push(S.sums.filter(x => x >= b && x < b + 10).length); labels.push(b); }
  bars($("#chart-sum"), buckets, labels, { fmt: v => `${v} tirages` });
  $("#sum-note").textContent = `Moyenne ${S.sumMean.toFixed(0)} · 80 % des tirages entre ${S.sumP10} et ${S.sumP90}.`;
  $("#pairs").innerHTML = `<table><tr><th>Paire</th><th class="num">Sorties</th></tr>${S.topPairs.slice(0, 10).map(p => `<tr><td>${balls({ n: [p.a, p.b], s: [] })}</td><td class="num">${p.c}</td></tr>`).join("")}</table>`;
  const dist = (arr, lab) => `<table><tr><th>${lab}</th>${arr.map((_, i) => `<th class="num">${i}</th>`).join("")}</tr><tr><td>% des tirages</td>${arr.map(v => `<td class="num">${pct(v / S.N)}</td>`).join("")}</tr></table>`;
  $("#profiles").innerHTML = `<div class="scroll">${dist(S.oddDist, "Nb d'impairs")}</div><br><div class="scroll">${dist(S.lowDist, "Nb de 1 à 25")}</div>`;
  const top = (arr, key, k = 10) => Array.from({ length: 50 }, (_, i) => i + 1).sort((a, b) => arr[b] - arr[a]).slice(0, k);
  $("#late").innerHTML = `<table><tr><th>Numéro</th><th class="num">Tirages sans sortir</th></tr>${top(S.numGap).map(n => `<tr><td>${balls({ n: [n], s: [] })}</td><td class="num">${S.numGap[n]}</td></tr>`).join("")}</table>`;
  $("#hot").innerHTML = `<table><tr><th>Numéro</th><th class="num">Sorties / 100 tirages</th></tr>${top(S.numRecent).map(n => `<tr><td>${balls({ n: [n], s: [] })}</td><td class="num">${S.numRecent[n]}</td></tr>`).join("")}</table>`;
}
function renderFreq() {
  const S = STATS, l = Array.from({ length: 50 }, (_, i) => i + 1);
  const v = freqMode === "all" ? l.map(n => S.numFreq[n]) : freqMode === "recent" ? l.map(n => S.numRecent[n]) : l.map(n => S.numGap[n]);
  bars($("#chart-num"), v, l, { fmt: x => freqMode === "gap" ? `${x} tirages sans sortir` : `${x} sorties` });
}
$$("#freq-mode button").forEach(b => b.addEventListener("click", () => {
  freqMode = b.dataset.v; $$("#freq-mode button").forEach(x => x.classList.toggle("on", x === b)); renderFreq();
}));
function nextDrawDate() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 8; i++) { const x = new Date(d); x.setDate(d.getDate() + i); if ((x.getDay() === 2 || x.getDay() === 5) && x.toISOString().slice(0, 10) > DRAWS[DRAWS.length - 1].d) return x; }
  return d;
}

// ---------- générateur ----------
$("#g-pop").addEventListener("input", e => ($("#g-pop-v").textContent = e.target.value));
function runGen() {
  const count = Math.max(1, Math.min(50, +$("#g-count").value || 1));
  lastGen = E.generateGrids({ stats: STATS, draws: DRAWS, count, mode: $("#g-mode").value, seed: genSeed, maxPop: +$("#g-pop").value });
  const ep = $("#g-ep").checked, dpw = +$("#g-dpw").value;
  const c = E.cost({ combos: lastGen.length, etoilePlus: ep, drawsPerWeek: dpw });
  const sim = E.simulate(lastGen, { etoilePlus: ep, trials: 30000 });
  $("#g-out").innerHTML = `<div class="facts"><span>Coût : <b>${eur(c.perDraw)}</b>/tirage · <b>${eur(c.perWeek)}</b>/semaine</span><span>Jackpot : <b>${oneIn(lastGen.length / E.JACKPOT_ODDS)}</b></span><span>Au moins un gain : <b>${pct(sim.pAnyEP)}</b> par tirage</span></div>`
    + budgetCheck(c.perWeek) + gridList(lastGen)
    + (lastGen.length < count ? `<p class="muted">Seulement ${lastGen.length} grilles respectent tes filtres : augmente la popularité max.</p>` : "");
}
$("#g-run").addEventListener("click", () => { genSeed = 1 + Math.floor(Math.random() * 1e9); runGen(); });
$("#g-reroll").addEventListener("click", () => { genSeed++; runGen(); });
$("#g-log").addEventListener("click", () => {
  if (!lastGen.length) return;
  const c = E.cost({ combos: lastGen.length, etoilePlus: $("#g-ep").checked, drawsPerWeek: +$("#g-dpw").value });
  logStake(c.perWeek, `${lastGen.length} grille(s) générées`);
});
const parseNums = (s, max) => (s.match(/\d+/g) || []).map(Number).filter(x => x >= 1 && x <= max).filter((v, i, a) => a.indexOf(v) === i);
$("#a-run").addEventListener("click", () => {
  const n = parseNums($("#a-nums").value, 50).sort((a, b) => a - b), s = parseNums($("#a-stars").value, 12).sort((a, b) => a - b);
  if (n.length !== 5 || s.length !== 2) { $("#a-out").innerHTML = `<div class="alert">Il faut exactement 5 numéros (1-50) et 2 étoiles (1-12).</div>`; return; }
  const p = E.popularity(n, s, E.pastSetsOf(DRAWS));
  let best = { k: -1 }, exact = null;
  for (const d of DRAWS) {
    const k = d.n.filter(x => n.includes(x)).length, j = d.s.filter(x => s.includes(x)).length;
    if (k * 10 + j > best.k * 10 + (best.j || 0)) best = { k, j, d };
    if (k === 5 && j === 2) exact = d;
  }
  const sum = n.reduce((a, b) => a + b, 0);
  $("#a-out").innerHTML = `<div class="grille">${balls({ n, s })}${popTag(p.score)}</div>
    <p>${p.reasons.length ? "Ce qui la rend populaire : " + p.reasons.join(", ") + "." : "Rien de typiquement « populaire » : bon point anti-partage."}</p>
    <p class="muted">Somme ${sum} (80 % des tirages entre ${STATS.sumP10} et ${STATS.sumP90}). ${exact ? `Cette combinaison exacte est déjà sortie le ${fmtDate(exact.d)}.` : "Jamais sortie telle quelle."} Meilleur résultat historique : ${best.k} numéro(s) + ${best.j} étoile(s) le ${fmtDate(best.d.d)}.</p>
    <p class="muted">Sa probabilité de jackpot est la même que n'importe quelle autre : 1 sur 139 838 160.</p>`;
});

// ---------- recouvrement ----------
const wSel = new Set(), wStars = new Set();
function renderBoards() {
  $("#w-board").innerHTML = Array.from({ length: 50 }, (_, i) => `<button data-n="${i + 1}" class="${wSel.has(i + 1) ? "on" : ""}">${i + 1}</button>`).join("");
  $("#w-sboard").innerHTML = Array.from({ length: 12 }, (_, i) => `<button data-s="${i + 1}" class="${wStars.has(i + 1) ? "on" : ""}">${i + 1}</button>`).join("");
  $("#w-count").textContent = `(${wSel.size} sélectionnés, 6 à 20)`;
}
$("#w-board").addEventListener("click", e => { const n = +e.target.dataset.n; if (!n) return; wSel.has(n) ? wSel.delete(n) : wSel.size < 20 && wSel.add(n); renderBoards(); });
$("#w-sboard").addEventListener("click", e => { const s = +e.target.dataset.s; if (!s) return; wStars.has(s) ? wStars.delete(s) : wStars.size < 4 && wStars.add(s); renderBoards(); });
$("#w-type").innerHTML = E.WHEEL_TYPES.map((w, i) => `<option value="${i}" ${i === 1 ? "selected" : ""}>${w.label}</option>`).join("");
$("#w-auto").addEventListener("click", () => {
  const seed = 1 + Math.floor(Math.random() * 1e9), mode = settings().mode;
  wSel.clear(); E.pickSelection(STATS, mode, 10, seed).forEach(n => wSel.add(n));
  wStars.clear(); E.pickSelection(STATS, mode, 3, seed + 1, 12).forEach(s => wStars.add(s));
  renderBoards();
});
$("#w-clear").addEventListener("click", () => { wSel.clear(); wStars.clear(); renderBoards(); $("#w-out").innerHTML = ""; });
$("#w-run").addEventListener("click", () => {
  if (wSel.size < 6) { $("#w-out").innerHTML = `<div class="alert">Sélectionne au moins 6 numéros.</div>`; return; }
  if (wStars.size < 2) { $("#w-out").innerHTML = `<div class="alert">Sélectionne au moins 2 étoiles.</div>`; return; }
  const wt = E.WHEEL_TYPES[+$("#w-type").value];
  const sel = [...wSel], K = sel.length;
  if (wt.m > K) return;
  const grids = E.wheel(sel, wt.t, wt.m, { stars: [...wStars], pastSets: E.pastSetsOf(DRAWS) });
  const ep = $("#w-ep").checked, dpw = +$("#w-dpw").value;
  const c = E.cost({ combos: grids.length, etoilePlus: ep, drawsPerWeek: dpw });
  const full = E.C(K, 5);
  let pAtLeast = 0; for (let k = wt.m; k <= 5; k++) pAtLeast += E.C(K, k) * E.C(50 - K, 5 - k) / E.C(50, 5);
  const sim = E.simulate(grids, { etoilePlus: ep, trials: 30000 });
  $("#w-out").innerHTML = `<div class="facts">
      <span>Grilles : <b>${grids.length}</b> (au lieu de ${full.toLocaleString("fr-FR")} pour tout couvrir)</span>
      <span>Coût : <b>${eur(c.perDraw)}</b>/tirage · <b>${eur(c.perWeek)}</b>/semaine</span>
      <span>Au moins un gain : <b>${pct(sim.pAnyEP)}</b> par tirage</span></div>
    <p><b>Garantie :</b> si au moins ${wt.m} des 5 numéros tirés sont dans tes ${K}, au moins une grille contient ${wt.t} bons numéros. Ça arrive dans <b>${pct(pAtLeast)}</b> des tirages (${oneIn(pAtLeast)}). Les étoiles ne sont pas couvertes par la garantie.</p>
    ${budgetCheck(c.perWeek)}${gridList(grids)}`;
});

// ---------- coûts ----------
const MULTS = E.allMultiples();
$("#c-mult").innerHTML += MULTS.filter(m => m.combos > 1).map((m, i) => `<option value="${i}">${m.nums} numéros × ${m.stars} étoiles (${m.combos} comb.)</option>`).join("");
function renderCost() {
  const simple = Math.max(0, +$("#c-simple").value || 0), mi = $("#c-mult").value;
  const m = mi === "" ? null : MULTS.filter(x => x.combos > 1)[+mi];
  const combos = simple + (m ? m.combos : 0), ep = $("#c-ep").checked, dpw = +$("#c-dpw").value, weeks = +$("#c-weeks").value || 1;
  const c = E.cost({ combos, etoilePlus: ep, drawsPerWeek: dpw, weeks });
  $("#c-out").innerHTML = `<table>
    <tr><td>Combinaisons par tirage</td><td class="num"><b>${combos}</b></td></tr>
    <tr><td>Coût par tirage</td><td class="num"><b>${eur(c.perDraw)}</b>${ep ? ` <span class="muted">(dont Étoile+ ${eur(combos)})</span>` : ""}</td></tr>
    <tr><td>Coût par semaine</td><td class="num"><b>${eur(c.perWeek)}</b></td></tr>
    <tr><td>Coût par mois (moyenne)</td><td class="num"><b>${eur(c.perMonth)}</b></td></tr>
    <tr><td>Coût sur ${weeks} semaine(s)</td><td class="num"><b>${eur(c.total)}</b></td></tr>
    <tr><td>Chance de jackpot par tirage</td><td class="num">${oneIn(combos / E.JACKPOT_ODDS)}</td></tr>
    <tr><td>Retour moyen attendu (structurel)</td><td class="num">≈ ${eur(c.total * 0.5)} <span class="muted">soit ~50 % de la mise</span></td></tr>
  </table>${budgetCheck(c.perWeek)}`;
}
["#c-simple", "#c-mult", "#c-ep", "#c-dpw", "#c-weeks"].forEach(s => $(s).addEventListener("input", renderCost));
function renderTables() {
  const nums = [5, 6, 7, 8, 9, 10];
  let h = `<table><tr><th>Étoiles \\ Numéros</th>${nums.map(n => `<th class="num">${n}</th>`).join("")}</tr>`;
  for (let s = 2; s <= 12; s++) {
    h += `<tr><th>${s}</th>${nums.map(n => { const c = E.multipleCombos(n, s); return c ? `<td class="num" data-tip="${c} combinaisons · avec Étoile+ : ${eur(c * 3.5)}">${eur(c * E.PRICE)}</td>` : `<td></td>`; }).join("")}</tr>`;
  }
  $("#mult-table").innerHTML = h + "</table>";
  const rows = E.RANKS.map(([k, j], i) => { const p = E.pNum(k) * E.pStar(j); return `<tr><td>Rang ${i + 1}</td><td>${k} + ${j}★</td><td class="num">${oneIn(p)}</td></tr>`; }).join("");
  const any = E.pAnyPrize(E.RANKS), anyEP = E.pAnyPrize([...E.RANKS, [0, 2], [0, 1]]);
  $("#ranks-table").innerHTML = `<table><tr><th>Rang</th><th>Bons numéros + étoiles</th><th class="num">Probabilité</th></tr>${rows}
    <tr><td colspan="2"><b>Au moins un rang</b></td><td class="num"><b>${oneIn(any)}</b></td></tr>
    <tr><td colspan="2"><b>Au moins un gain avec Étoile+</b> (ajoute 0 n° + 1 ou 2★)</td><td class="num"><b>${oneIn(anyEP)}</b></td></tr></table>
    <p class="muted">Gains EuroMillions non fixes (pari mutuel), sauf My Million : 1 M€ pour un code par tirage, inclus dans chaque grille.</p>`;
}
$("#p-run").addEventListener("click", () => {
  const b = +$("#p-budget").value || 0, dpw = +$("#p-dpw").value;
  if (b / dpw < E.PRICE) { $("#p-out").innerHTML = `<div class="alert">Minimum ${eur(E.PRICE * dpw)} par semaine.</div>`; return; }
  const plans = E.proposePlans({ budgetWeek: b, drawsPerWeek: dpw, stats: STATS, draws: DRAWS, mode: settings().mode, seed: 1 + Math.floor(Math.random() * 1e9) });
  $("#p-out").innerHTML = `<div class="scroll"><table><tr><th>Formule</th><th class="num">€/semaine</th><th class="num">Jackpot</th><th class="num">≥ 1 gain/tirage</th><th class="num">Nb de gains attendus/tirage</th></tr>
    ${plans.map(p => `<tr><td>${p.title}</td><td class="num">${eur(p.cost.perWeek)}</td><td class="num">${oneIn(p.pJackpot)}</td><td class="num">${pct(p.sim.pAnyEP)}</td><td class="num">${p.sim.expectedWins.toFixed(2)}</td></tr>`).join("")}</table></div>`
    + plans.map((p, i) => planHTML(p, i === 0)).join("");
});

// ---------- historique ----------
let hLimit = 100;
function renderHistory() {
  const f = parseNums($("#h-filter").value, 50), y = $("#h-year").value;
  const rows = DRAWS.slice().reverse().filter(d => (!y || d.d.startsWith(y)) && f.every(n => d.n.includes(n)));
  $("#h-count").textContent = `${rows.length} tirage(s)`;
  const hit = f.length ? { n: f, s: [] } : null;
  $("#h-table").innerHTML = `<table><tr><th>Date</th><th>Numéros · étoiles</th></tr>${rows.slice(0, hLimit).map(d => `<tr><td>${fmtDate(d.d)}</td><td>${balls(d, hit)}</td></tr>`).join("")}</table>`;
  $("#h-more").hidden = rows.length <= hLimit;
}
$("#h-filter").addEventListener("input", () => { hLimit = 100; renderHistory(); });
$("#h-year").addEventListener("change", () => { hLimit = 100; renderHistory(); });
$("#h-more").addEventListener("click", () => { hLimit += 200; renderHistory(); });

// ---------- démarrage ----------
async function init() {
  try { CONFIG = await (await fetch("config.json", { cache: "no-cache" })).json(); } catch { CONFIG = {}; }
  const strip = c => ({ budgetWeek: c.budget_hebdo, budgetMonth: c.plafond_mensuel, drawsPerWeek: c.tirages_par_semaine, mode: c.strategie });
  CONFIG = Object.fromEntries(Object.entries(strip(CONFIG)).filter(([, v]) => v !== undefined));
  let data;
  try { data = await (await fetch("data/draws.json", { cache: "no-cache" })).json(); }
  catch { $("#loading").innerHTML = "L'historique n'est pas encore téléchargé. Il le sera au premier passage de la mise à jour automatique (onglet Actions du dépôt GitHub)."; return; }
  DRAWS = data.draws; STATS = E.computeStats(DRAWS);
  $("#loading").remove();
  const years = [...new Set(DRAWS.map(d => d.d.slice(0, 4)))].reverse();
  $("#h-year").innerHTML += years.map(y => `<option>${y}</option>`).join("");
  $("#j-date").value = new Date().toISOString().slice(0, 10);
  $("#foot").innerHTML = `Données officielles FDJ (<a href="${data.source}" target="_blank" rel="noopener">source</a>) · ${data.count} tirages du ${fmtDate(data.first)} au ${fmtDate(data.last)} · mis à jour le ${new Date(data.updated).toLocaleString("fr-FR")}. Jouer comporte des risques : endettement, isolement, dépendance. 09 74 75 13 13.`;
  renderBudget(); renderWeek(); renderStats(); renderBoards(); renderCost(); renderTables(); renderHistory();
  let tab = "semaine"; try { tab = sessionStorage.getItem("em.tab") || tab; } catch { /* ignore */ }
  showTab(tab);
}
let rz;
addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (STATS && !$("#stats").hidden) renderStats(); }, 200); });
init();
