// Message hebdomadaire : grilles de la semaine + coût + rappel budget, envoyé sur Telegram.
// Secrets attendus : TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID. Sans eux, le message est seulement affiché.
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
  `<b>EuroMillions · semaine ${wk.split("-W")[1]}</b>`,
  `Dernier tirage (${last.d}) : ${last.n.join(" ")} ★ ${last.s.join(" ")}`,
  "",
  `<b>Formule recommandée :</b> ${best.title}`,
  `<pre>${best.grids.map(fmt).join("\n")}</pre>`,
  `Coût : ${eur(best.cost.perDraw)}/tirage, ${eur(best.cost.perWeek)} pour ${dpw === 2 ? "mardi + vendredi" : "1 tirage"} (budget ${eur(budgetWeek)}).`,
  `Au moins un gain : ${(best.sim.pAnyEP * 100).toFixed(1)} % par tirage. Jackpot : 1 sur ${Math.round(1 / best.pJackpot).toLocaleString("fr-FR")}.`,
];
const others = plans.slice(1).map(p => `• ${p.title} : ${eur(p.cost.perWeek)}/sem., ≥1 gain ${(p.sim.pAnyEP * 100).toFixed(1)} %`);
if (others.length) lines.push("", "<b>Autres formules au même budget :</b>", ...others);
lines.push("", `Plafond du mois : ${eur(cfg.plafond_mensuel ?? budgetWeek * 4.5)}. Pas un euro de plus. Le jackpot ne se « rattrape » pas.`);
if (cfg.url_appli) lines.push(`<a href="${cfg.url_appli}">Ouvrir l'appli</a>`);
const text = lines.join("\n");

const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
if (!token || !chat) {
  console.log(text);
  console.log("\n[info] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID absents : message non envoyé.");
} else {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  const body = await r.json();
  if (!body.ok) { console.error(body); process.exit(1); }
  console.log("Message envoyé.");
}
