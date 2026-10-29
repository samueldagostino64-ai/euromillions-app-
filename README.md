# EuroMillions Stratège

Appli web (GitHub Pages) : historique officiel FDJ depuis 2004, statistiques, grilles anti-partage, systèmes de recouvrement, coût de chaque formule, comparaison par budget, garde-fou budget, et message Telegram chaque lundi.

**À savoir :** aucune statistique ne change la probabilité d'un tirage (jackpot : 1 sur 139 838 160 par combinaison). L'appli optimise ce qui peut l'être : ne pas partager le gain (anti-partage), gagner plus souvent un petit rang (grilles étalées), garantir un rang (recouvrement), et ne pas dépasser son budget.

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html`, `app/` | L'appli (statique, sans dépendance) |
| `app/core.js` | Moteur : stats, popularité, générateur, recouvrement, coûts, simulation. Partagé avec le script hebdo |
| `scripts/update_draws.py` | Télécharge les 6 archives FDJ et écrit `data/draws.json` + `data/draws.csv` |
| `scripts/weekly.mjs` | Construit et envoie le message hebdomadaire |
| `config.json` | Budget hebdo, plafond mensuel, tirages/semaine, stratégie (utilisés par le message) |
| `.github/workflows/update-draws.yml` | Mise à jour mardi et vendredi soir + lendemain matin |
| `.github/workflows/weekly-message.yml` | Envoi chaque lundi 11:00 UTC (8 h en Guyane) |

## Mise en route

1. **Pages** : Settings → Pages → Source « Deploy from a branch », branche `main`, dossier `/ (root)`.
2. **Données** : Actions → « Mise à jour des tirages » → Run workflow (premier téléchargement complet).
3. **Telegram** : créer un bot avec @BotFather (récupérer le token), envoyer un message au bot, puis lire son `chat.id` sur `https://api.telegram.org/bot<TOKEN>/getUpdates`. Ajouter les secrets `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` (Settings → Secrets and variables → Actions). Tester avec Actions → « Message hebdomadaire » → Run workflow.

## Tarifs (règlement FDJ homologué ANJ, 2025)

2,50 € par combinaison simple (My Million inclus), Étoile+ 1 € par combinaison. Multiples : jusqu'à 10 numéros (2 étoiles) ou 12 étoiles (5–6 numéros), voir l'onglet Coûts.

Jouer comporte des risques : endettement, isolement, dépendance. Joueurs Info Service : 09 74 75 13 13.
