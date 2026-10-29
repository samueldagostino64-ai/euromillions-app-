#!/usr/bin/env python3
"""Télécharge l'historique officiel FDJ EuroMillions et écrit data/draws.json + data/draws.csv.

Sources : archives ZIP publiées sur
https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique
Aucune dépendance externe (bibliothèque standard uniquement).
"""
import csv
import io
import json
import re
import sys
import urllib.request
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

HIST_PAGE = "https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique"
DOC_BASE = "https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/"
# Archives connues (fév. 2004 → aujourd'hui). La page est aussi scannée pour en trouver de nouvelles.
KNOWN_IDS = [
    "1a2b3c4d-9876-4562-b3fc-2c963f66afa8",  # 02/2004 → 05/2011
    "1a2b3c4d-9876-4562-b3fc-2c963f66afa9",  # 05/2011 → 02/2014
    "1a2b3c4d-9876-4562-b3fc-2c963f66afb6",  # 02/2014 → 09/2016
    "1a2b3c4d-9876-4562-b3fc-2c963f66afc6",  # 09/2016 → 02/2019
    "1a2b3c4d-9876-4562-b3fc-2c963f66afd6",  # 03/2019 → 02/2020
    "1a2b3c4d-9876-4562-b3fc-2c963f66afe6",  # 02/2020 → aujourd'hui
]
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "data" / "draws.json"
OUT_CSV = ROOT / "data" / "draws.csv"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def discover_ids() -> list[str]:
    ids = list(KNOWN_IDS)
    try:
        html = fetch(HIST_PAGE).decode("utf-8", "replace")
        for m in re.findall(r"documentations/([0-9a-f-]{36})", html):
            if m not in ids:
                ids.append(m)
    except Exception as e:  # la page peut changer, les IDs connus suffisent
        print(f"[warn] page historique illisible : {e}", file=sys.stderr)
    return ids


def parse_date(raw: str) -> date | None:
    raw = raw.strip()
    for fmt in ("%d/%m/%Y", "%Y%m%d", "%d/%m/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            pass
    return None


def parse_csv(text: str) -> list[dict]:
    lines = text.splitlines()
    if not lines:
        return []
    reader = csv.DictReader(lines, delimiter=";")
    out = []
    for row in reader:
        row = {k.strip().lower(): (v or "").strip() for k, v in row.items() if isinstance(k, str) and isinstance(v, (str, type(None)))}
        d = parse_date(row.get("date_de_tirage", ""))
        try:
            nums = sorted(int(row[f"boule_{i}"]) for i in range(1, 6))
            stars = sorted(int(row[f"etoile_{i}"]) for i in range(1, 3))
        except (KeyError, ValueError):
            continue
        if not d or not all(1 <= n <= 50 for n in nums) or not all(1 <= s <= 12 for s in stars):
            continue
        out.append({"d": d.isoformat(), "n": nums, "s": stars})
    return out


def parse_zip(blob: bytes, diag: list) -> list[dict]:
    draws = []
    if not blob.startswith(b"PK"):
        diag.append("pas un zip : " + blob[:200].decode("utf-8", "replace"))
        return draws
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        for name in z.namelist():
            if not name.lower().endswith(".csv"):
                continue
            raw = z.read(name)
            for enc in ("utf-8-sig", "latin-1"):
                try:
                    text = raw.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
            rows = parse_csv(text)
            if not rows:
                diag.append(f"{name} : 0 ligne lue, entête = " + " | ".join(text.splitlines()[:2])[:600])
            draws.extend(rows)
    return draws


def main() -> int:
    by_date: dict[str, dict] = {}
    if OUT_JSON.exists():  # on garde l'existant si une archive est momentanément indisponible
        for dr in json.loads(OUT_JSON.read_text())["draws"]:
            by_date[dr["d"]] = dr
    before = len(by_date)
    ok = 0
    report = {}
    for doc_id in discover_ids():
        diag = []
        try:
            draws = parse_zip(fetch(DOC_BASE + doc_id), diag)
            ok += 1
            report[doc_id] = {"tirages": len(draws), "diag": diag}
            print(f"{doc_id}: {len(draws)} tirages")
            for dr in draws:
                by_date[dr["d"]] = dr
        except Exception as e:
            report[doc_id] = {"erreur": str(e)}
            print(f"[warn] {doc_id}: {e}", file=sys.stderr)
    if ok == 0:
        print("Aucune archive téléchargée", file=sys.stderr)
        return 1
    draws = sorted(by_date.values(), key=lambda x: x["d"])
    payload = {
        "source": HIST_PAGE,
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(draws),
        "first": draws[0]["d"],
        "last": draws[-1]["d"],
        "archives": report,
        "draws": draws,
    }
    OUT_JSON.parent.mkdir(exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, separators=(",", ":")))
    with OUT_CSV.open("w", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["date", "n1", "n2", "n3", "n4", "n5", "e1", "e2"])
        for dr in draws:
            w.writerow([dr["d"], *dr["n"], *dr["s"]])
    print(f"{len(draws)} tirages ({draws[0]['d']} → {draws[-1]['d']}), +{len(draws) - before} nouveaux")
    return 0


if __name__ == "__main__":
    sys.exit(main())
