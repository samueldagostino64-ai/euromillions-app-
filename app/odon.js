// Odon, l'astronaute du pourboire : il flotte en bas de l'écran et tend son bidon de carburant.
// Pas de pub, pas de compte : un lien de don libre (Ko-fi), proposé sans insister.
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LS = "em.odon";
const state = () => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } };
const save = s => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* navigation privée */ } };

const LINES = [
  "Houston, on a un… café ?",
  "Mon jetpack tourne au café. ☕",
  "Je pilote les boules, pas le hasard.",
  "1 sur 139 838 160… mais 1 sur 1 pour un café !",
  "Je gravite autour de ton budget.",
  "Si tu gagnes, pense à Odon. Même sans gagner aussi.",
  "Odon, astronaute bénévole. Pour l'instant.",
];

const ASTRONAUT = `
<svg viewBox="0 0 120 140" aria-hidden="true" class="odon-svg">
  <defs>
    <radialGradient id="od-visor" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#bff6ff"/><stop offset=".35" stop-color="#2fd9f5"/><stop offset="1" stop-color="#3b1d8f"/></radialGradient>
    <radialGradient id="od-suit" cx="35%" cy="25%" r="90%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c8c9ee"/></radialGradient>
    <linearGradient id="od-flame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8"/><stop offset=".4" stop-color="#ffb547"/><stop offset="1" stop-color="#ff5fa8" stop-opacity="0"/></linearGradient>
  </defs>
  <g class="od-flames"><path class="od-f1" d="M34 98 q6 22 0 34 q-6 -12 0 -34z" fill="url(#od-flame)"/><path class="od-f2" d="M86 98 q6 22 0 34 q-6 -12 0 -34z" fill="url(#od-flame)"/></g>
  <rect x="26" y="58" width="68" height="44" rx="14" fill="#8b6cff" stroke="#3b1d8f" stroke-width="3"/>
  <g class="od-arm-l"><rect x="10" y="64" width="22" height="13" rx="6.5" fill="url(#od-suit)" stroke="#5a56a8" stroke-width="2.5"/><circle cx="10" cy="70" r="6" fill="#ff5fa8"/></g>
  <g class="od-arm-r"><rect x="88" y="64" width="24" height="13" rx="6.5" fill="url(#od-suit)" stroke="#5a56a8" stroke-width="2.5"/>
    <g class="od-cup"><rect x="104" y="50" width="14" height="16" rx="3" fill="#ffb547" stroke="#8a4a00" stroke-width="2"/><path d="M118 54 q6 2 0 8" fill="none" stroke="#8a4a00" stroke-width="2"/><path class="od-steam" d="M108 46 q-3 -5 0 -9 M114 46 q-3 -5 0 -9" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/></g></g>
  <rect x="34" y="62" width="52" height="42" rx="16" fill="url(#od-suit)" stroke="#5a56a8" stroke-width="3"/>
  <rect x="48" y="76" width="24" height="12" rx="3" fill="#2a1d8f"/><circle cx="54" cy="82" r="2.4" fill="#3ee08f"/><circle cx="61" cy="82" r="2.4" fill="#ffb547"/><circle cx="68" cy="82" r="2.4" fill="#ff5fa8"/>
  <rect x="40" y="100" width="14" height="18" rx="6" fill="url(#od-suit)" stroke="#5a56a8" stroke-width="2.5"/><rect x="66" y="100" width="14" height="18" rx="6" fill="url(#od-suit)" stroke="#5a56a8" stroke-width="2.5"/>
  <circle cx="60" cy="38" r="30" fill="url(#od-suit)" stroke="#5a56a8" stroke-width="3"/>
  <ellipse cx="60" cy="40" rx="21" ry="17" fill="url(#od-visor)" stroke="#3b1d8f" stroke-width="2.5"/>
  <ellipse cx="52" cy="33" rx="6" ry="3.5" fill="#fff" opacity=".85" transform="rotate(-25 52 33)"/>
  <line x1="60" y1="8" x2="60" y2="-2" stroke="#5a56a8" stroke-width="3"/><circle class="od-antenna" cx="60" cy="-4" r="5" fill="#ff5fa8"/>
</svg>`;

export function initOdon(url) {
  if (!/^https:\/\//.test(url || "")) return;
  const wrap = document.createElement("div");
  wrap.className = "odon";
  wrap.innerHTML = `
    <div class="odon-bubble" id="odon-bubble" role="status"></div>
    <button class="odon-btn" type="button" aria-haspopup="dialog" aria-label="Odon l'astronaute : laisser un pourboire">${ASTRONAUT}<span class="odon-name">Odon</span></button>`;
  document.body.appendChild(wrap);

  const dlg = document.createElement("div");
  dlg.className = "odon-modal"; dlg.hidden = true;
  dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "odon-title");
  dlg.innerHTML = `
    <div class="odon-card">
      <button class="odon-x" type="button" aria-label="Fermer">×</button>
      <div class="odon-hero">${ASTRONAUT}</div>
      <h2 id="odon-title">Fais le plein du jetpack d'Odon</h2>
      <p>EuroMillions Stratège est gratuit, sans pub, et tes données restent sur ton téléphone. Odon passe ses nuits à recalculer 20 ans de tirages et à traquer les numéros que tout le monde joue.</p>
      <p>Si l'appli te plaît, ou si un jour une de ses grilles te fait gagner, laisse-lui un petit pourboire. Ça paie le carburant… et les prochaines améliorations.</p>
      <div class="odon-amounts" aria-hidden="true"><span>☕ un café</span><span>🚀 un plein</span><span>🪐 une orbite complète</span></div>
      <p class="odon-note">ℹ️ Tu vas arriver sur la page Ko-fi <strong>« Sac de Layon »</strong> : c'est l'autre appli du même créateur, avec la même cagnotte. Pas d'inquiétude, c'est bien Odon qui en profite.</p>
      <a class="odon-go" href="${url}" target="_blank" rel="noopener">Offrir un pourboire à Odon</a>
      <small>Don libre, en quelques secondes, sans créer de compte. Rien n'est débloqué : tout reste gratuit pour tout le monde.</small>
    </div>`;
  document.body.appendChild(dlg);

  const bubble = wrap.querySelector("#odon-bubble"), btn = wrap.querySelector(".odon-btn");
  const open = () => { dlg.hidden = false; dlg.querySelector(".odon-go").focus(); bubble.classList.remove("show"); };
  const close = () => { dlg.hidden = true; btn.focus(); };
  btn.addEventListener("click", open);
  dlg.querySelector(".odon-x").addEventListener("click", close);
  dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
  addEventListener("keydown", e => { if (e.key === "Escape" && !dlg.hidden) close(); });
  dlg.querySelector(".odon-go").addEventListener("click", () => { const s = state(); s.gave = Date.now(); save(s); });

  // Petites phrases, rarement : jamais si un pourboire a été laissé ces 6 derniers mois
  const s = state();
  const quiet = s.gave && Date.now() - s.gave < 180 * 864e5;
  let i = Math.floor(Math.random() * LINES.length);
  function say() {
    if (quiet || !dlg.hidden) return;
    bubble.textContent = LINES[i++ % LINES.length];
    bubble.classList.add("show");
    setTimeout(() => bubble.classList.remove("show"), 5200);
  }
  setTimeout(say, 9000);
  if (!reduce) setInterval(say, 45000);
  // Une pirouette de temps en temps
  if (!reduce) setInterval(() => { btn.classList.add("loop"); setTimeout(() => btn.classList.remove("loop"), 1400); }, 17000);
}
