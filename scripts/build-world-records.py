"""Genera src/data/world-records.json con los records del mundo vigentes, desde la pagina de Wikipedia 'List of world records in athletics'
(CC BY-SA 4.0: se cita en la pagina /records). Uso: python scripts/build-world-records.py
Por cada prueba se toma la mejor marca de las filas que la pagina lista (la pagina anade filas por marcas pendientes de homologar o empatadas).
Peticion anonima: sin datos personales en el User-Agent."""
import json, re, sys, pathlib, urllib.request
from io import StringIO
import pandas as pd

UA = {"User-Agent": "Mozilla/5.0 (compatible; records-builder)"}
url = "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_world_records_in_athletics&prop=text%7Crevid&format=json&formatversion=2"
data = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read())["parse"]
tables = pd.read_html(StringIO(data["text"]))

FIELD = {"high jump": "High Jump", "pole vault": "Pole Vault", "long jump": "Long Jump", "triple jump": "Triple Jump", "shot put": "Shot Put",
         "discus throw": "Discus Throw", "hammer throw": "Hammer Throw", "javelin throw": "Javelin Throw", "decathlon": "Decathlon", "heptathlon": "Heptathlon",
         "pentathlon": "Pentathlon", "marathon": "Marathon", "half marathon": "Half Marathon"}


def clean(s):
    t = re.sub(r"\[[^\]]*\]", "", str(s)).strip()
    return "" if t.lower() == "nan" else t


def canonical(ev):
    """Nombre de prueba de nuestra base si coincide (para enlazar a /disciplines), o None."""
    e = clean(ev).lower().replace(" sh", "").strip()
    if e in FIELD:
        return FIELD[e]
    m = re.fullmatch(r"([\d,]+) m( hurdles| steeplechase)?", e)
    if m:
        n = m.group(1).replace(",", "")
        return f"{n} Metres" + {None: "", " hurdles": " Hurdles", " steeplechase": " Steeplechase"}[m.group(2)]
    m = re.fullmatch(r"([\d,]+) m steeplechase", e)
    return None


def value(perf):
    p = clean(perf).replace("+", "")
    m = re.fullmatch(r"([\d,]+(?:\.\d+)?) (m|pts)", p)
    if m:
        return float(m.group(1).replace(",", "")), True  # distancia/puntos: mayor es mejor
    parts = p.split(":")
    try:
        return sum(float(x) * 60 ** i for i, x in enumerate(reversed(parts))), False
    except ValueError:
        return None, False


out = []
for gender, tab in (("Men", tables[0]), ("Women", tables[1])):
    tab.columns = [c[0] if isinstance(c, tuple) else c for c in tab.columns]
    best = {}
    for _, r in tab.iterrows():
        ev = clean(r["Event"])
        v, higher = value(r["Perf."])
        if v is None:
            continue
        cur = best.get(ev)
        if cur is None or (v > cur[0] if higher else v < cur[0]):
            best[ev] = (v, r)
    for ev, (v, r) in best.items():
        low = ev.lower()
        kind = "relay" if "relay" in low else "indoor" if low.endswith(" sh") else "road" if "(road)" in low or "marathon" in low or "km" in low else "outdoor"
        nat = clean(r["Nat."]).split()[0] if clean(r["Nat."]) else ""
        out.append({
            "gender": gender, "event": re.sub(r" sh$", "", ev), "kind": kind, "canonical": canonical(ev) if kind != "relay" else None,
            "perf": clean(r["Perf."]), "athlete": clean(r["Athlete(s)"]), "nat": nat, "date": clean(r["Date"]),
            "meeting": clean(r.get("Meeting", "")), "location": clean(r.get("Location", "")), "country": clean(r.get("Ctry.", "")),
        })
dest = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "world-records.json"
dest.write_text(json.dumps({"source": "https://en.wikipedia.org/wiki/List_of_world_records_in_athletics", "revid": data.get("revid"), "records": out}, ensure_ascii=False, indent=1), encoding="utf-8")
print(len(out), "records ->", dest)
