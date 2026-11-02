// Moteur EuroMillions : stats, anti-partage, générateur, recouvrement, coûts, simulation.
// Module ES utilisé à la fois par le navigateur (app.js) et par Node (scripts/weekly.mjs).

export const PRICE = 2.5;          // € par combinaison simple (My Million inclus)
export const ETOILE_PLUS = 1;      // € par combinaison simple
export const JACKPOT_ODDS = 139838160;
let POP = null; // modèle de popularité mesurée (fitPopularity), facultatif
export const STARS_12_SINCE = "2016-09-27"; // premier tirage avec 12 étoiles

// Grilles multiples autorisées (règlement FDJ homologué ANJ 2025) : numéros -> étoiles max
export const MULTIPLE_MAX_STARS = { 5: 12, 6: 12, 7: 6, 8: 4, 9: 3, 10: 2 };

// Rangs EuroMillions [numéros, étoiles] et Étoile+ (règlement FDJ)
export const RANKS = [[5,2],[5,1],[5,0],[4,2],[4,1],[3,2],[4,0],[2,2],[3,1],[3,0],[1,2],[2,1],[2,0]];
export const RANKS_EP = [[5,1],[4,2],[4,1],[3,2],[2,2],[3,1],[1,2],[0,2],[2,1],[0,1]];

// ---------- maths ----------
export function C(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
  return Math.round(r);
}

export function combinations(arr, k) {
  const out = [], cur = [];
  (function rec(start) {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i <= arr.length - (k - cur.length); i++) { cur.push(arr[i]); rec(i + 1); cur.pop(); }
  })(0);
  return out;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Semaine ISO "2026-W44" (la clé qui rend les grilles de la semaine identiques partout)
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
}

// Probabilité d'avoir k bons numéros / j bonnes étoiles sur une combinaison simple
export const pNum = k => C(5, k) * C(45, 5 - k) / C(50, 5);
export const pStar = j => C(2, j) * C(10, 2 - j) / C(12, 2);
export const pAnyPrize = ranks => ranks.reduce((s, [k, j]) => s + pNum(k) * pStar(j), 0);

// ---------- statistiques ----------
export function computeStats(draws, recentN = 100) {
  const N = draws.length;
  const numFreq = Array(51).fill(0), numRecent = Array(51).fill(0), numLast = Array(51).fill(-1);
  const starFreq = Array(13).fill(0), starLast = Array(13).fill(-1);
  const pairs = new Map(), sums = [], oddDist = Array(6).fill(0), lowDist = Array(6).fill(0);
  let starDraws = 0;
  draws.forEach((dr, i) => {
    for (const n of dr.n) { numFreq[n]++; numLast[n] = i; if (i >= N - recentN) numRecent[n]++; }
    if (dr.d >= STARS_12_SINCE) { starDraws++; for (const s of dr.s) { starFreq[s]++; starLast[s] = i; } }
    for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) {
      const key = dr.n[a] * 100 + dr.n[b];
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
    sums.push(dr.n.reduce((x, y) => x + y, 0));
    oddDist[dr.n.filter(n => n % 2).length]++;
    lowDist[dr.n.filter(n => n <= 25).length]++;
  });
  const numGap = numLast.map(l => (l < 0 ? N : N - 1 - l));
  const starGap = starLast.map(l => (l < 0 ? starDraws : N - 1 - l));
  const sorted = sums.slice().sort((a, b) => a - b);
  const pct = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const topPairs = [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([k, c]) => ({ a: Math.floor(k / 100), b: k % 100, c }));
  // Test du khi-deux : les fréquences sont-elles compatibles avec du pur hasard ?
  const exp = N * 5 / 50;
  let chi2 = 0;
  for (let n = 1; n <= 50; n++) chi2 += (numFreq[n] - exp) ** 2 / exp;
  return {
    N, recentN, numFreq, numRecent, numGap, starFreq, starGap, starDraws, topPairs, sums,
    sumMean: sums.reduce((a, b) => a + b, 0) / (N || 1),
    sumP10: pct(0.1), sumP90: pct(0.9), oddDist, lowDist,
    chi2, chi2p: chi2PValue(chi2, 49),
  };
}

// Approximation de Wilson-Hilferty pour la p-value du khi-deux
function chi2PValue(x, k) {
  if (!x) return 1;
  const z = (Math.cbrt(x / k) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
  return 1 - normCdf(z);
}
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// ---------- anti-partage ----------
// Score de popularité 0..100 : plus il est bas, moins la grille ressemble à ce que jouent les autres.
export function popularity(nums, stars, pastSets = null) {
  const n = nums.slice().sort((a, b) => a - b);
  let s = 0;
  const reasons = [];
  let share = 1;
  if (POP) {
    // popularité mesurée sur les gagnants FDJ : 12 points pour une grille moyenne, 0 à -1 écart-type
    const z = shareLog(n, stars) / POP.ticketSD;
    share = Math.exp(shareLog(n, stars));
    s += Math.max(0, Math.round(12 + 12 * z));
    if (z > 0.5) reasons.push(`numéros très joués par le public (≈ ${Math.round((share - 1) * 100)} % de co-gagnants en plus)`);
    else if (z < -0.5) reasons.push(`numéros boudés par le public (≈ ${Math.round((1 - share) * 100)} % de co-gagnants en moins)`);
  } else {
    const dates = n.filter(x => x <= 31).length;
    if (dates >= 3) { s += (dates - 2) * 12; reasons.push(`${dates} numéros ≤ 31 (dates)`); }
  }
  let consec = 0;
  for (let i = 1; i < 5; i++) if (n[i] - n[i - 1] === 1) consec++;
  if (consec) { s += consec * 8; reasons.push(`${consec} suite(s)`); }
  const gaps = n.slice(1).map((x, i) => x - n[i]);
  if (gaps.every(g => g === gaps[0])) { s += 30; reasons.push("progression régulière"); }
  const decades = new Set(n.map(x => Math.floor((x - 1) / 10)));
  if (decades.size <= 2) { s += 10; reasons.push("numéros groupés"); }
  const endings = new Set(n.map(x => x % 10));
  if (endings.size <= 2) { s += 10; reasons.push("mêmes terminaisons"); }
  const mult = [5, 7, 10].find(m => n.every(x => x % m === 0));
  if (mult) { s += 20; reasons.push(`tous multiples de ${mult}`); }
  if (!POP && n.includes(7)) s += 3;
  if (!POP && n.reduce((a, b) => a + b, 0) < 90) { s += 8; reasons.push("somme faible"); }
  if (!POP && stars && stars.length === 2) {
    if (stars.includes(7)) s += 3;
    if (stars[0] <= 7 && stars[1] <= 7) s += 4;
  }
  if (pastSets) {
    for (const p of pastSets) {
      let k = 0;
      for (const x of n) if (p.has(x)) k++;
      if (k >= 4) { s += 25; reasons.push("rejoue un ancien tirage"); break; }
    }
  }
  return { score: Math.min(100, s), reasons, share };
}

// ---------- générateur de grilles ----------
// Pondération : neutre (uniforme), chauds (fréquents récents), retard (gros écarts), mix.
export function weights(stats, mode) {
  const wN = Array(51).fill(1), wS = Array(13).fill(1);
  wN[0] = 0; wS[0] = 0;
  if (!stats || mode === "neutre") return { wN, wS };
  const avgRecent = stats.recentN * 5 / 50;
  for (let n = 1; n <= 50; n++) {
    const hot = stats.numRecent[n] / avgRecent;
    const late = Math.min(3, stats.numGap[n] / 10);
    wN[n] = mode === "chauds" ? 0.5 + hot : mode === "retard" ? 0.5 + late : 0.5 + (hot + late) / 2;
  }
  const avgStar = stats.starDraws * 2 / 12 || 1;
  for (let s = 1; s <= 12; s++) {
    const hot = stats.starFreq[s] / avgStar, late = Math.min(3, stats.starGap[s] / 6);
    wS[s] = mode === "chauds" ? 0.5 + hot : mode === "retard" ? 0.5 + late : 0.5 + (hot + late) / 2;
  }
  return { wN, wS };
}

function pickWeighted(w, k, rnd, pool = null) {
  const cand = (pool || w.map((_, i) => i)).filter(i => w[i] > 0);
  const out = [];
  while (out.length < k && cand.length) {
    const tot = cand.reduce((a, i) => a + w[i], 0);
    let r = rnd() * tot, idx = 0;
    while (r > w[cand[idx]] && idx < cand.length - 1) { r -= w[cand[idx]]; idx++; }
    out.push(cand.splice(idx, 1)[0]);
  }
  return out.sort((a, b) => a - b);
}

// Sélection de K numéros (ou étoiles si max=12), pondérée et orientée anti-partage (favorise > 31)
export function pickSelection(stats, mode, K, seed, max = 50) {
  const { wN, wS } = weights(stats, mode);
  const w = max === 12 ? wS : wN.map((x, i) => (i > 31 ? x * 1.6 : x));
  return pickWeighted(w, K, mulberry32(seed));
}

export function pastSetsOf(draws) {
  return draws.map(d => new Set(d.n));
}

// Génère `count` grilles simples, peu populaires, profil standard, et peu recouvrantes entre elles.
export function generateGrids({ stats, draws, count, mode = "mix", seed = 1, maxPop = 15, maxShared = 2 }) {
  const rnd = mulberry32(seed);
  const { wN, wS } = weights(stats, mode);
  const past = draws ? pastSetsOf(draws) : null;
  const lo = stats ? stats.sumP10 : 95, hi = stats ? stats.sumP90 : 160;
  const grids = [];
  // Avec la popularité mesurée, on garde pour chaque grille la meilleure de plusieurs candidates
  const pool = POP ? 60 : 1;
  let tries = 0;
  while (grids.length < count && tries < 20000 * count) {
    let best = null;
    for (let c = 0; c < pool && tries < 20000 * count; c++) {
      tries++;
      const n = pickWeighted(wN, 5, rnd);
      const s = pickWeighted(wS, 2, rnd);
      const sum = n.reduce((a, b) => a + b, 0);
      const odd = n.filter(x => x % 2).length;
      const relax = tries > 5000 * count; // si les contraintes sont trop serrées, on relâche
      if (!relax && (sum < lo || sum > hi || odd === 0 || odd === 5)) continue;
      const pop = popularity(n, s, past);
      if (pop.score > (relax ? maxPop + 20 : maxPop)) continue;
      const share = relax ? 3 : maxShared;
      if (grids.some(g => g.n.filter(x => n.includes(x)).length > share)) continue;
      if (grids.some(g => g.n.join() === n.join() && g.s.join() === s.join())) continue;
      if (!best || pop.score < best.pop || (pop.score === best.pop && pop.share < best.share)) best = { n, s, pop: pop.score, share: pop.share };
    }
    if (best) grids.push(best);
  }
  return grids;
}

// ---------- recouvrement (wheeling) ----------
// Couvre une sélection de K numéros : si `m` numéros tirés sont dans la sélection,
// au moins une grille en contient `t`. Algorithme glouton (design de couverture abrégé).
export function wheel(selection, t, m, { pastSets = null, stars = [], maxBlocks = 400 } = {}) {
  const sel = selection.slice().sort((a, b) => a - b);
  const K = sel.length;
  if (K < 5) return [];
  if (K === 5) return [{ n: sel, s: stars.slice(0, 2) }];
  const idx = sel.map((_, i) => i);
  const blocks = combinations(idx, 5);
  const targets = combinations(idx, m);
  const tIndex = new Map(targets.map((tg, i) => [tg.join(","), i]));
  // pour chaque bloc, la liste des m-sous-ensembles qu'il couvre (intersection >= t)
  const cover = blocks.map(b => {
    const list = [];
    const outB = idx.filter(i => !b.includes(i));
    for (let k = t; k <= Math.min(m, 5); k++) {
      for (const inside of combinations(b, k)) {
        for (const outside of combinations(outB, m - k)) {
          const key = inside.concat(outside).sort((x, y) => x - y).join(",");
          list.push(tIndex.get(key));
        }
      }
    }
    return list;
  });
  const pop = blocks.map(b => popularity(b.map(i => sel[i]), null, pastSets).score);
  const covered = new Uint8Array(targets.length);
  let left = targets.length;
  const chosen = [];
  while (left > 0 && chosen.length < maxBlocks) {
    let best = -1, bestGain = 0, bestPop = 1e9;
    for (let b = 0; b < blocks.length; b++) {
      let g = 0;
      for (const ti of cover[b]) if (!covered[ti]) g++;
      if (g > bestGain || (g === bestGain && g > 0 && pop[b] < bestPop)) { best = b; bestGain = g; bestPop = pop[b]; }
    }
    if (best < 0) break;
    for (const ti of cover[best]) if (!covered[ti]) { covered[ti] = 1; left--; }
    chosen.push(blocks[best].map(i => sel[i]));
  }
  // étoiles : rotation sur toutes les paires de la sélection d'étoiles
  const starPairs = stars.length >= 2 ? combinations(stars.slice().sort((a, b) => a - b), 2) : [[]];
  return chosen.map((n, i) => ({ n, s: starPairs[i % starPairs.length] }));
}

export const WHEEL_TYPES = [
  { t: 2, m: 2, label: "2 bons si 2 dans la sélection" },
  { t: 3, m: 3, label: "3 bons si 3 dans la sélection" },
  { t: 3, m: 4, label: "3 bons si 4 dans la sélection" },
  { t: 4, m: 4, label: "4 bons si 4 dans la sélection" },
  { t: 3, m: 5, label: "3 bons si 5 dans la sélection" },
  { t: 4, m: 5, label: "4 bons si 5 dans la sélection" },
];

// ---------- coûts ----------
export function multipleCombos(nNums, nStars) {
  if (!MULTIPLE_MAX_STARS[nNums] || nStars < 2 || nStars > MULTIPLE_MAX_STARS[nNums]) return 0;
  return C(nNums, 5) * C(nStars, 2);
}

export function cost({ combos, etoilePlus = false, drawsPerWeek = 1, weeks = 1 }) {
  const perDraw = combos * (PRICE + (etoilePlus ? ETOILE_PLUS : 0));
  return { perDraw, perWeek: perDraw * drawsPerWeek, perMonth: perDraw * drawsPerWeek * 52 / 12, total: perDraw * drawsPerWeek * weeks };
}

export function allMultiples() {
  const out = [];
  for (const [n, maxS] of Object.entries(MULTIPLE_MAX_STARS)) {
    for (let s = 2; s <= maxS; s++) out.push({ nums: +n, stars: s, combos: multipleCombos(+n, s) });
  }
  return out;
}

// Développe une grille multiple en combinaisons simples
export function expandMultiple(nums, stars) {
  const out = [];
  for (const n of combinations(nums, 5)) for (const s of combinations(stars, 2)) out.push({ n, s });
  return out;
}

// ---------- simulation Monte-Carlo ----------
function maskOf(nums) { let lo = 0, hi = 0; for (const x of nums) x <= 25 ? (lo |= 1 << (x - 1)) : (hi |= 1 << (x - 26)); return [lo, hi]; }
function popcnt(x) { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }

// Probabilité, par tirage, de gagner au moins un rang avec un ensemble de grilles (estimée par simulation).
export function simulate(grids, { etoilePlus = false, trials = 60000, seed = 7 } = {}) {
  if (!grids.length) return { pAny: 0, pAnyEP: 0, expectedWins: 0, rankHits: [] };
  const rnd = mulberry32(seed);
  const G = grids.map(g => ({ m: maskOf(g.n), s: g.s }));
  const rankKey = new Map(RANKS.map(([k, j], i) => [k * 10 + j, i]));
  const epKey = new Set(RANKS_EP.map(([k, j]) => k * 10 + j));
  const rankHits = Array(RANKS.length).fill(0);
  let any = 0, anyEP = 0, wins = 0;
  const pool = Array.from({ length: 50 }, (_, i) => i + 1);
  for (let t = 0; t < trials; t++) {
    for (let i = 0; i < 5; i++) { const j = i + Math.floor(rnd() * (50 - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const [lo, hi] = maskOf(pool.slice(0, 5));
    const s1 = 1 + Math.floor(rnd() * 12);
    let s2 = 1 + Math.floor(rnd() * 11); if (s2 >= s1) s2++;
    let hit = false, hitEP = false;
    for (const g of G) {
      const k = popcnt(g.m[0] & lo) + popcnt(g.m[1] & hi);
      const j = (g.s.includes(s1) ? 1 : 0) + (g.s.includes(s2) ? 1 : 0);
      const r = rankKey.get(k * 10 + j);
      if (r !== undefined) { rankHits[r]++; wins++; hit = true; }
      if (etoilePlus && epKey.has(k * 10 + j)) hitEP = true;
    }
    if (hit) any++;
    if (hit || hitEP) anyEP++;
  }
  return { pAny: any / trials, pAnyEP: etoilePlus ? anyEP / trials : any / trials, expectedWins: wins / trials, rankHits: rankHits.map(h => h / trials) };
}

// ---------- formules optimisées par budget ----------
// Propose plusieurs façons de dépenser le même budget et les compare honnêtement.
export function proposePlans({ budgetWeek, drawsPerWeek = 2, stats, draws, mode = "mix", seed = 1, selection = null }) {
  const perDraw = budgetWeek / drawsPerWeek;
  const plans = [];
  const nSimple = Math.min(50, Math.floor(perDraw / PRICE + 1e-9));
  if (nSimple >= 1) {
    const grids = generateGrids({ stats, draws, count: nSimple, mode, seed });
    plans.push({ id: "simples", title: `${nSimple} grille(s) simple(s) anti-partage`, grids, etoilePlus: false,
      note: "Grilles peu jouées par le public et peu recouvrantes entre elles : même chance de jackpot, moins de partage." });
  }
  const nEP = Math.min(50, Math.floor(perDraw / (PRICE + ETOILE_PLUS) + 1e-9));
  if (nEP >= 1) {
    const grids = generateGrids({ stats, draws, count: nEP, mode, seed: seed + 1 });
    plans.push({ id: "etoileplus", title: `${nEP} grille(s) simple(s) + Étoile+`, grids, etoilePlus: true,
      note: "Moins de combinaisons, mais Étoile+ fait gagner un petit lot environ une fois sur 4 : utile pour amortir, pas pour le jackpot." });
  }
  const mults = allMultiples().filter(m => m.combos > 1 && m.combos * PRICE <= perDraw + 1e-9)
    .sort((a, b) => b.combos - a.combos || b.nums - a.nums);
  if (mults.length) {
    const m = mults[0];
    const base = generateGrids({ stats, draws, count: 1, mode, seed: seed + 2 })[0];
    const rnd = mulberry32(seed + 3);
    const { wN, wS } = weights(stats, mode);
    const nums = pickWeighted(wN.map((w, i) => (i > 31 ? w * 1.6 : w)), m.nums - 5, rnd, Array.from({ length: 51 }, (_, i) => i).filter(i => i && !base.n.includes(i)))
      .concat(base.n).sort((a, b) => a - b);
    const stars = pickWeighted(wS, m.stars - 2, rnd, Array.from({ length: 13 }, (_, i) => i).filter(i => i && !base.s.includes(i)))
      .concat(base.s).sort((a, b) => a - b);
    plans.push({ id: "multiple", title: `Grille multiple ${m.nums} numéros × ${m.stars} étoiles`, grids: expandMultiple(nums, stars), etoilePlus: false,
      multiple: { nums, stars },
      note: `Si les 5 bons numéros sont dans tes ${m.nums} et les 2 étoiles dans tes ${m.stars}, tu as le jackpot, garanti. Les combinaisons se chevauchent fortement : gains rares mais groupés.` });
  }
  // Recouvrement : plus grande sélection dont le système « 3 si 3 » tient dans le budget
  const starSel = pickSelection(stats, mode, 3, seed + 20, 12);
  for (let K = 12; K >= 6; K--) {
    const sel = selection && selection.length === K ? selection : pickSelection(stats, mode, K, seed + 10 + K);
    const grids = wheel(sel, 3, 3, { stars: starSel });
    if (grids.length >= 2 && grids.length * PRICE <= perDraw + 1e-9) {
      plans.push({ id: "wheel", title: `Recouvrement ${K} numéros (garantie 3 si 3), ${grids.length} grilles`, grids, etoilePlus: false,
        wheel: { selection: sel, stars: starSel },
        note: `Si 3 des 5 numéros tirés sont parmi tes ${K}, au moins une grille a 3 bons numéros. Le jackpot reste possible mais n'est pas garanti.` });
      break;
    }
  }
  for (const p of plans) {
    const c = cost({ combos: p.grids.length, etoilePlus: p.etoilePlus, drawsPerWeek });
    p.cost = c;
    p.pJackpot = p.grids.length / JACKPOT_ODDS;
    p.sim = simulate(p.grids, { etoilePlus: p.etoilePlus, trials: 30000, seed: seed + 99 });
  }
  return plans;
}

// ---------- popularité mesurée (régression sur le nombre de gagnants FDJ) ----------
// Chaque tirage publie le nombre de gagnants par rang. À ventes égales, un rang a plus de
// gagnants quand les numéros tirés sont des numéros que le public joue souvent.
// Étape 1, par tirage : log(gagnants/probabilité) ~ a + b·(nb de bons numéros) + c·(nb de bonnes étoiles).
//   b mesure à quel point les 5 numéros tirés sont « joués », c pareil pour les 2 étoiles ;
//   la constante a absorbe le volume de ventes du tirage.
// Étape 2, sur tous les tirages : 5·b = Σ β(numéros tirés), 2·c = Σ γ(étoiles tirées) (moindres carrés ridge).
// β(n) > 0 : numéro plus joué que la moyenne ; exp(β) ≈ facteur de partage.
const CANON = ["5+2","5+1","5+0","4+2","4+1","3+2","4+0","2+2","3+1","3+0","1+2","2+1","2+0"];
const FIT_RANKS = ["3+1","3+0","2+2","2+1","2+0","1+2","3+2","4+0","4+1"];

export function starsInPlay(d) { return d < "2011-05-10" ? 9 : d < "2016-09-24" ? 11 : 12; }
function pCombo(k, j, ns) { return C(5, k) * C(45, 5 - k) / C(50, 5) * C(2, j) * C(ns - 2, 2 - j) / C(ns, 2); }

function solve(A, b) { // Gauss-Jordan, A carrée symétrique définie positive
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function invert(A) { const n = A.length; return A.map((_, i) => solve(A, A.map((__, k) => (k === i ? 1 : 0)))).map((col, i, cols) => cols.map(c => c[i])); }

// Régression linéaire pondérée simple y ~ X (petite dimension), renvoie coefficients
function wls(X, y, w) {
  const p = X[0].length, A = Array.from({ length: p }, () => Array(p).fill(0)), b = Array(p).fill(0);
  X.forEach((x, i) => { for (let a = 0; a < p; a++) { b[a] += w[i] * x[a] * y[i]; for (let c = 0; c < p; c++) A[a][c] += w[i] * x[a] * x[c]; } });
  return solve(A, b);
}

export function drawSignals(dr) {
  if (!dr.g) return null;
  const ns = starsInPlay(dr.d), X = [], y = [], w = [];
  for (const key of FIT_RANKS) {
    const row = dr.g[CANON.indexOf(key)];
    if (!row) continue;
    const win = row[2] || row[1];          // gagnants Europe si dispo, sinon France
    if (!win || win < 30) continue;
    const [k, j] = key.split("+").map(Number);
    X.push([1, k, j]); y.push(Math.log(win / pCombo(k, j, ns))); w.push(win);
  }
  if (X.length < 5) return null;
  const [, bk, bj] = wls(X, y, w.map(v => Math.sqrt(v)));
  return { B: 5 * bk, G: 2 * bj };
}

export function fitPopularity(draws, { lambda = 2 } = {}) {
  const obs = draws.map(d => ({ d, s: drawSignals(d) })).filter(o => o.s);
  // Étape 2 : ridge. Variables : 50 numéros puis 12 étoiles (deux régressions indépendantes)
  function ridge(rows, dim, pick, target) {
    const A = Array.from({ length: dim }, () => Array(dim).fill(0)), b = Array(dim).fill(0);
    const mean = rows.reduce((s, o) => s + target(o), 0) / rows.length;
    for (const o of rows) { const idx = pick(o).map(v => v - 1), t = target(o) - mean; for (const a of idx) { b[a] += t; for (const c of idx) A[a][c] += 1; } }
    for (let a = 0; a < dim; a++) A[a][a] += lambda;
    const beta = solve(A, b), inv = invert(A);
    let rss = 0; for (const o of rows) { const e = target(o) - mean - pick(o).reduce((s, v) => s + beta[v - 1], 0); rss += e * e; }
    const s2 = rss / Math.max(1, rows.length - dim);
    const m = beta.reduce((s, v) => s + v, 0) / dim;
    return { beta: beta.map(v => v - m), se: inv.map((r, i) => Math.sqrt(Math.max(0, r[i] * s2))), n: rows.length };
  }
  const num = ridge(obs, 50, o => o.d.n, o => o.s.B);
  const starRows = obs.filter(o => o.d.d >= STARS_12_SINCE);
  const star = ridge(starRows, 12, o => o.d.s, o => o.s.G);
  // dispersion du score d'un ticket aléatoire, pour convertir en points
  const rnd = mulberry32(99); let s1 = 0, s2 = 0; const T = 20000;
  for (let t = 0; t < T; t++) {
    const pool = Array.from({ length: 50 }, (_, i) => i + 1);
    let m = 0; for (let i = 0; i < 5; i++) { const j = i + Math.floor(rnd() * (50 - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; m += num.beta[pool[i] - 1]; }
    const a = 1 + Math.floor(rnd() * 12); let b = 1 + Math.floor(rnd() * 11); if (b >= a) b++;
    m += star.beta[a - 1] + star.beta[b - 1]; s1 += m; s2 += m * m;
  }
  const sd = Math.sqrt(s2 / T - (s1 / T) ** 2);
  return { num: num.beta, numSE: num.se, star: star.beta, starSE: star.se, nDraws: num.n, nStarDraws: star.n, ticketSD: sd };
}

export function setPopularityModel(model) { POP = model; }
export function getPopularityModel() { return POP; }

// Log du facteur de partage d'une grille : 0 = grille moyenne, +0,3 ≈ 35 % de co-gagnants en plus
export function shareLog(nums, stars) {
  if (!POP) return 0;
  return nums.reduce((s, n) => s + POP.num[n - 1], 0) + (stars || []).reduce((s, x) => s + POP.star[x - 1], 0);
}
