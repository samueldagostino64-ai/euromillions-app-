// Analyses lourdes, recalculées après chaque mise à jour des tirages → data/analysis.json
// 1) Popularité mesurée des numéros et étoiles (régression sur les gagnants FDJ) + validation hors échantillon
// 2) Tribunal des stratégies : chaque méthode rejoue l'historique, payée avec les vrais gains FDJ
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "../app/core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { draws } = JSON.parse(fs.readFileSync(path.join(root, "data/draws.json"), "utf8"));
const N = draws.length;
const CANON = ["5+2","5+1","5+0","4+2","4+1","3+2","4+0","2+2","3+1","3+0","1+2","2+1","2+0"];

// ---------- 1. popularité ----------
const pop = E.fitPopularity(draws);
// Validation : modèle appris avant 2021, testé sur 2021 → aujourd'hui (le modèle n'a jamais vu ces tirages)
const cut = "2021-01-01";
const popPast = E.fitPopularity(draws.filter(d => d.d < cut));
function corr(a, b) {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb);
}
const test = draws.filter(d => d.d >= cut).map(d => ({ d, s: E.drawSignals(d) })).filter(o => o.s);
const predB = test.map(o => o.d.n.reduce((s, n) => s + popPast.num[n - 1], 0));
const predG = test.map(o => o.d.s.reduce((s, x) => s + popPast.star[x - 1], 0));
const validation = {
  coupure: cut, tiragesTest: test.length,
  corrNumeros: corr(predB, test.map(o => o.s.B)),
  corrEtoiles: corr(predG, test.map(o => o.s.G)),
  // stabilité : les deux estimations (avant 2021 / tout l'historique) se ressemblent-elles ?
  stabiliteNumeros: corr(popPast.num, pop.num),
};
// Preuve par les gains : sur 2021 → aujourd'hui, le modèle (appris avant 2021) classe les tirages
// du plus « boudé » au plus « joué ». On compare les gains réellement versés par rang.
const ranked = draws.filter(d => d.d >= cut && d.g)
  .map(d => ({ d, p: d.n.reduce((s, n) => s + popPast.num[n - 1], 0) + d.s.reduce((s, x) => s + popPast.star[x - 1], 0) }))
  .sort((a, b) => a.p - b.p);
const third = Math.floor(ranked.length / 3), lowT = ranked.slice(0, third), highT = ranked.slice(-third);
const median = a => { a = a.filter(x => x > 0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
const preuve = {
  tirages: ranked.length, parGroupe: third,
  rangs: ["5+1", "5+0", "4+2", "4+1", "3+2", "4+0", "2+2", "3+1"].map(c => {
    const i = CANON.indexOf(c);
    const lo = median(lowT.map(o => o.d.g[i]?.[0] || 0)), hi = median(highT.map(o => o.d.g[i]?.[0] || 0));
    return { combo: c, gainBoudes: lo, gainJoues: hi, ecart: lo / hi - 1 };
  }),
  jackpotGagnantsBoudes: lowT.reduce((s, o) => s + (o.d.g[0]?.[2] || 0), 0) / third,
  jackpotGagnantsJoues: highT.reduce((s, o) => s + (o.d.g[0]?.[2] || 0), 0) / third,
};
validation.preuve = preuve;
E.setPopularityModel(pop);

// ---------- 2. tribunal des stratégies ----------
const START = 104;            // 2 ans d'historique avant de commencer à jouer
const GRIDS = 2;              // 2 grilles par tirage = 10 €/semaine en jouant mardi et vendredi
const RANDOM_PLAYERS = 300;   // joueurs « hasard pur » pour la référence statistique

function prizeOf(grid, dr) {
  const k = grid.n.filter(x => dr.n.includes(x)).length;
  const j = grid.s.filter(x => dr.s.includes(x)).length;
  const key = `${k}+${j}`, idx = CANON.indexOf(key);
  if (idx < 0 || !dr.g || !dr.g[idx]) return { k, j, rank: null, pay: 0 };
  const pay = dr.g[idx][0] || 0;
  return { k, j, rank: idx + 1, pay, jackpotNoWinner: idx === 0 && !pay };
}
function randGrid(rnd, ns) {
  const pool = Array.from({ length: 50 }, (_, i) => i + 1);
  for (let i = 0; i < 5; i++) { const j = i + Math.floor(rnd() * (50 - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const sp = Array.from({ length: ns }, (_, i) => i + 1);
  for (let i = 0; i < 2; i++) { const j = i + Math.floor(rnd() * (ns - i)); [sp[i], sp[j]] = [sp[j], sp[i]]; }
  return { n: pool.slice(0, 5).sort((a, b) => a - b), s: sp.slice(0, 2).sort((a, b) => a - b) };
}
function fromPool(rnd, nums, stars) {
  const a = nums.slice(), b = stars.slice();
  for (let i = 0; i < 5; i++) { const j = i + Math.floor(rnd() * (a.length - i)); [a[i], a[j]] = [a[j], a[i]]; }
  for (let i = 0; i < 2; i++) { const j = i + Math.floor(rnd() * (b.length - i)); [b[i], b[j]] = [b[j], b[i]]; }
  return { n: a.slice(0, 5).sort((x, y) => x - y), s: b.slice(0, 2).sort((x, y) => x - y) };
}
const topBy = (arr, from, to, k) => Array.from({ length: to - from + 1 }, (_, i) => i + from).sort((a, b) => arr[b] - arr[a]).slice(0, k);

// Compteurs incrémentaux pour que chaque stratégie ne voie QUE le passé
const H = { freq: Array(51).fill(0), last: Array(51).fill(-1), sfreq: Array(13).fill(0), slast: Array(13).fill(-1), pairs: new Map() };
function learn(i) {
  const dr = draws[i];
  for (const n of dr.n) { H.freq[n]++; H.last[n] = i; }
  for (const s of dr.s) { H.sfreq[s]++; H.slast[s] = i; }
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) { const k = dr.n[a] * 100 + dr.n[b]; H.pairs.set(k, (H.pairs.get(k) || 0) + 1); }
}
function recentFreq(i, w, max, key) {
  const f = Array(max + 1).fill(0);
  for (let t = Math.max(0, i - w); t < i; t++) for (const x of draws[t][key]) f[x]++;
  return f;
}
// « Modèle prédictif » : fréquence pondérée exponentiellement, demi-vie choisie par maximum de vraisemblance sur le passé
const HALF_LIVES = [10, 25, 50, 100, 200, 400, 1e9];
let bestHL = 50;
function ewFreq(i, hl, max, key) {
  const f = Array(max + 1).fill(1e-3), a = Math.pow(0.5, 1 / hl);
  let wgt = 1;
  for (let t = i - 1; t >= 0; t--) { for (const x of draws[t][key]) if (x <= max) f[x] += wgt; wgt *= a; if (wgt < 1e-4) break; }
  return f;
}
function tuneHL(i) {
  let best = -Infinity;
  for (const hl of HALF_LIVES) {
    let ll = 0;
    for (let t = Math.max(1, i - 150); t < i; t++) {
      const f = ewFreq(t, hl, 50, "n"), tot = f.reduce((s, v) => s + v, 0);
      for (const n of draws[t].n) ll += Math.log(f[n] / tot);
    }
    if (ll > best) { best = ll; bestHL = hl; }
  }
}

const STRATS = [
  { id: "hasard", nom: "Hasard pur", desc: "Grilles tirées au sort, sans aucune statistique.", play: (i, rnd, ns) => [randGrid(rnd, ns), randGrid(rnd, ns)] },
  { id: "chauds", nom: "Numéros chauds", desc: "Les 10 numéros et 4 étoiles les plus sortis sur les 50 derniers tirages.",
    play: (i, rnd, ns) => { const f = recentFreq(i, 50, 50, "n"), fs_ = recentFreq(i, 50, ns, "s"); const P = topBy(f, 1, 50, 10), S = topBy(fs_, 1, ns, 4); return [fromPool(rnd, P, S), fromPool(rnd, P, S)]; } },
  { id: "retards", nom: "Numéros en retard", desc: "Les 10 numéros et 4 étoiles absents depuis le plus longtemps (« ils doivent sortir »).",
    play: (i, rnd, ns) => { const gap = H.last.map(l => i - l), sg = H.slast.map(l => i - l); const P = topBy(gap, 1, 50, 10), S = topBy(sg, 1, ns, 4); return [fromPool(rnd, P, S), fromPool(rnd, P, S)]; } },
  { id: "frequence", nom: "Fréquence historique", desc: "Les 10 numéros et 4 étoiles les plus sortis depuis 2004.",
    play: (i, rnd, ns) => { const P = topBy(H.freq, 1, 50, 10), S = topBy(H.sfreq, 1, ns, 4); return [fromPool(rnd, P, S), fromPool(rnd, P, S)]; } },
  { id: "paires", nom: "Paires fortes", desc: "Grilles construites autour des paires de numéros les plus sorties ensemble.",
    play: (i, rnd, ns) => {
      const top = [...H.pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => [Math.floor(k / 100), k % 100]);
      const S = topBy(H.sfreq, 1, ns, 4);
      return [0, 1].map(g => { const set = new Set([...top[g * 2], ...top[g * 2 + 1]]); while (set.size < 5) set.add(1 + Math.floor(rnd() * 50)); return fromPool(rnd, [...set].slice(0, 5), S); });
    } },
  { id: "ia", nom: "Modèle prédictif", desc: "Fréquences pondérées dans le temps, mémoire optimisée tous les 100 tirages par maximum de vraisemblance (ce que vendent les « IA du loto »).",
    play: (i, rnd, ns) => { if ((i - START) % 100 === 0) tuneHL(i); const f = ewFreq(i, bestHL, 50, "n"), fs_ = ewFreq(i, bestHL, ns, "s"); return [fromPool(rnd, topBy(f, 1, 50, 7), topBy(fs_, 1, ns, 3)), fromPool(rnd, topBy(f, 1, 50, 7), topBy(fs_, 1, ns, 3))]; } },
  { id: "dernier", nom: "Rejouer les derniers tirages", desc: "Les numéros des deux tirages précédents.",
    play: (i) => [draws[i - 1], draws[i - 2]].map(d => ({ n: d.n.slice(), s: d.s.slice() })) },
  { id: "dates", nom: "Dates d'anniversaire", desc: "Grilles fixes faites de dates (numéros ≤ 31), comme une grande partie du public.",
    play: () => [{ n: [3, 7, 12, 19, 25], s: [3, 7] }, { n: [1, 8, 14, 21, 29], s: [2, 5] }] },
  { id: "antipartage", nom: "Anti-partage (l'appli)", desc: "Le générateur de l'appli, avec la popularité mesurée apprise uniquement sur les tirages passés.",
    play: (i, rnd, ns) => {
      // popularité réapprise tous les 100 tirages, sans jamais regarder le futur
      if ((i - START) % 100 === 0) E.setPopularityModel(E.fitPopularity(draws.slice(0, i)));
      const out = [];
      while (out.length < 2) {
        let best = null;
        for (let c = 0; c < 400; c++) {
          const g = randGrid(rnd, ns);
          const sc = E.popularity(g.n, g.s).score;
          if (!best || sc < best.sc) best = { g, sc };
        }
        if (!out.some(o => o.n.filter(x => best.g.n.includes(x)).length > 1)) out.push(best.g);
      }
      return out;
    } },
];

function blank() { return { mise: 0, gains: 0, grillesGagnantes: 0, bonsNumeros: 0, bonnesEtoiles: 0, grilles: 0, rangs: Array(13).fill(0), meilleur: null, jackpotsSansGagnant: 0, parAnnee: {} }; }
function record(acc, grid, dr) {
  const p = prizeOf(grid, dr);
  acc.mise += E.PRICE; acc.grilles++; acc.bonsNumeros += p.k; acc.bonnesEtoiles += p.j;
  const y = dr.d.slice(0, 4);
  acc.parAnnee[y] = acc.parAnnee[y] || { mise: 0, gains: 0 };
  acc.parAnnee[y].mise += E.PRICE;
  if (p.rank) {
    acc.rangs[p.rank - 1]++; acc.grillesGagnantes++; acc.gains += p.pay; acc.parAnnee[y].gains += p.pay;
    if (p.jackpotNoWinner) acc.jackpotsSansGagnant++;
    if (!acc.meilleur || p.rank < acc.meilleur.rang) acc.meilleur = { rang: p.rank, combo: CANON[p.rank - 1], date: dr.d, gain: p.pay };
  }
}

const results = Object.fromEntries(STRATS.map(s => [s.id, blank()]));
const randoms = Array.from({ length: RANDOM_PLAYERS }, () => blank());
const rnds = Object.fromEntries(STRATS.map((s, i) => [s.id, E.mulberry32(1000 + i)]));
const rndPlayers = randoms.map((_, i) => E.mulberry32(50000 + i));
for (let i = 0; i < START; i++) learn(i);
for (let i = START; i < N; i++) {
  const dr = draws[i], ns = E.starsInPlay(dr.d);
  for (const s of STRATS) for (const g of s.play(i, rnds[s.id], ns).slice(0, GRIDS)) record(results[s.id], g, dr);
  randoms.forEach((acc, r) => { for (let g = 0; g < GRIDS; g++) record(acc, randGrid(rndPlayers[r], ns), dr); });
  learn(i);
}

// Référence statistique : où se situe chaque stratégie parmi 300 joueurs au hasard ?
const sd = arr => { const m = arr.reduce((s, v) => s + v, 0) / arr.length; return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length); };
const rGains = randoms.map(r => r.gains).sort((a, b) => a - b);
const rNums = randoms.map(r => r.bonsNumeros / r.grilles);
const rPayWin = randoms.map(r => r.gains / Math.max(1, r.grillesGagnantes));
const pctl = (arr, v) => arr.filter(x => x < v).length / arr.length;
const tirages = N - START;
const expNums = 0.5;                        // espérance de bons numéros par grille (5×5/50)
const sdNums = Math.sqrt(5 * (5 / 50) * (45 / 50) * (45 / 49));
const strategies = STRATS.map(s => {
  const r = results[s.id], mNums = r.bonsNumeros / r.grilles;
  return {
    id: s.id, nom: s.nom, desc: s.desc,
    mise: r.mise, gains: Math.round(r.gains * 100) / 100, retour: r.gains / r.mise,
    grillesGagnantes: r.grillesGagnantes, gainMoyenParGrilleGagnante: r.gains / Math.max(1, r.grillesGagnantes),
    bonsNumerosParGrille: mNums, zBonsNumeros: (mNums - expNums) / (sdNums / Math.sqrt(r.grilles)),
    bonnesEtoilesParGrille: r.bonnesEtoiles / r.grilles,
    percentileGains: pctl(rGains, r.gains), percentilePayout: pctl(rPayWin.slice().sort((a, b) => a - b), r.gains / Math.max(1, r.grillesGagnantes)),
    rangs: r.rangs, meilleur: r.meilleur, jackpotsSansGagnant: r.jackpotsSansGagnant, parAnnee: r.parAnnee,
  };
});

const out = {
  calcule: new Date().toISOString(),
  tiragesJoues: tirages, depuis: draws[START].d, jusqua: draws[N - 1].d, grillesParTirage: GRIDS, prixGrille: E.PRICE,
  hasard: {
    joueurs: RANDOM_PLAYERS,
    gainsMedian: rGains[Math.floor(rGains.length / 2)], gainsP5: rGains[Math.floor(0.05 * rGains.length)], gainsP95: rGains[Math.floor(0.95 * rGains.length)],
    bonsNumerosMoyen: rNums.reduce((s, v) => s + v, 0) / rNums.length, bonsNumerosSd: sd(rNums),
    gainParGrilleGagnanteMedian: rPayWin.slice().sort((a, b) => a - b)[Math.floor(rPayWin.length / 2)],
  },
  strategies,
  popularite: { ...pop, validation },
};
fs.writeFileSync(path.join(root, "data/analysis.json"), JSON.stringify(out));
for (const s of strategies) console.log(`${s.nom.padEnd(30)} retour ${(s.retour * 100).toFixed(1)} %  gains ${s.gains.toFixed(0)} €  bons n° ${s.bonsNumerosParGrille.toFixed(4)} (z ${s.zBonsNumeros.toFixed(2)})  gain/grille gagnante ${s.gainMoyenParGrilleGagnante.toFixed(2)} €  pct ${(s.percentileGains * 100).toFixed(0)}`);
console.log("hasard", out.hasard);
console.log("validation popularité", validation);
