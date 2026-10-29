// Message hebdomadaire : grilles de la semaine + coût + rappel budget.
// Le workflow le publie en issue GitHub assignée au propriétaire : GitHub l'envoie par e-mail.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "../app/core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
const { draws } = JSON.parse(fs.readFileSync(path.join(root, "data/draws.json"), "utf8"));
const stats = E.computeStats(draws);
const wk = E.isoWeek();
const budgetWeek = cfg.budget_hebdo ?? 10, dpw = cfg.tirages_par_semaine ?? 2;
const eur = v => v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const fmt = g => `${g.n.map(x => String(x).padStart(2, " ")).join(" ")}  ★ ${g.s.join(" ")}`;
const last = draws[draws.length - 1];

const plans = E.proposePlans({ budgetWeek, drawsPerWeek: dpw, stats, draws, mode: cfg.strategie ?? "mix", seed: E.hashSeed(wk) });
const best = plans[0];
const lines = [
  `**Dernier tirage (${last.d}) :** ${last.n.join(" ")} ★ ${last.s.join(" ")}`,
  "",
  `### Formule recommandée : ${best.title}`,
  "```",
  ...best.grids.map(fmt),
  "```",
  `Coût : **${eur(best.cost.perDraw)}**/tirage, **${eur(best.cost.perWeek)}** pour ${dpw === 2 ? "mardi + vendredi" : "1 tirage"} (budget ${eur(budgetWeek)}).`,
  `Au moins un gain : ${(best.sim.pAnyEP * 100).toFixed(1)} % par tirage. Jackpot : 1 sur ${Math.round(1 / best.pJackpot).toLocaleString("fr-FR")}.`,
];
const others = plans.slice(1).map(p => `- ${p.title} : ${eur(p.cost.perWeek)}/sem., au moins un gain ${(p.sim.pAnyEP * 100).toFixed(1)} %`);
if (others.length) lines.push("", "**Autres formules au même budget :**", ...others);
lines.push("", `Plafond du mois : ${eur(cfg.plafond_mensuel ?? budgetWeek * 4.5)}. Pas un euro de plus. Le jackpot ne se « rattrape » pas.`);
if (cfg.url_appli) lines.push("", `[Ouvrir l'appli](${cfg.url_appli})`);
if (process.env.NOTIFY) lines.push("", `@${process.env.NOTIFY}`);

// Sortie : titre puis corps Markdown, repris par le workflow pour créer l'issue (GitHub envoie l'e-mail).
fs.writeFileSync(path.join(root, "weekly-title.txt"), `Grilles EuroMillions · semaine ${wk.split("-W")[1]}`);
fs.writeFileSync(path.join(root, "weekly-body.md"), lines.join("\n"));
console.log(lines.join("\n"));
