"""
Собирает производственный календарь РФ с открытого сайта xmlcalendar.ru
и сохраняет его в data.json для приложения «Путь клиента».

- Берёт текущий и следующий год.
- Если сайт не ответил или прислал что-то странное — оставляет прежние данные
  этого года (или весь старый data.json) и не ломает приложение.
- Ключи и личные данные не нужны: календарь открытый.

Запуск: python fetch.py
"""
import json
import sys
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

# Два адреса одного и того же календаря. Первый — официальная копия проекта на GitHub
# (её видят серверы GitHub Actions), второй — основной сайт (он не отвечает зарубежным серверам).
SOURCES = [
    "https://xmlcalendar.github.io/data/ru/{year}/calendar.json",
    "https://xmlcalendar.ru/data/ru/{year}/calendar.json",
]
OUT = Path(__file__).with_name("data.json")


def load_old():
    """Прежний data.json, если он есть и читается."""
    try:
        return json.loads(OUT.read_text(encoding="utf-8"))
    except Exception:
        return None


def download(year):
    """Скачивает календарь года: пробует адреса по очереди, пока какой-то не ответит."""
    problems = []
    for url in SOURCES:
        try:
            req = urllib.request.Request(url.format(year=year), headers={"User-Agent": "put-klienta-calendar/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
            if raw.get("year") != year or len(raw.get("months", [])) != 12:
                raise ValueError("неожиданный формат ответа")
            return raw
        except Exception as e:
            problems.append(f"{url.split('/')[2]}: {e}")
    raise RuntimeError("; ".join(problems))


def fetch_year(year):
    """Календарь одного года: нерабочие дни, сокращённые дни, рабочие выходные."""
    raw = download(year)

    off, short = [], []
    for m in raw["months"]:
        month = int(m["month"])
        for item in str(m["days"]).split(","):
            item = item.strip()
            if not item:
                continue
            # «*» — сокращённый рабочий день, «+» — перенесённый выходной, без значка — выходной
            day = int(item.rstrip("*+"))
            iso = date(year, month, day).isoformat()  # заодно проверяет, что дата существует
            (short if item.endswith("*") else off).append(iso)

    # Субботы и воскресенья, которые стали рабочими из-за переносов
    off_set = set(off)
    work_weekends = []
    d = date(year, 1, 1)
    while d.year == year:
        if d.weekday() >= 5 and d.isoformat() not in off_set:
            work_weekends.append(d.isoformat())
        d = date.fromordinal(d.toordinal() + 1)

    if len(off) < 100:  # в году всегда больше 100 выходных — иначе ответ битый
        raise ValueError(f"слишком мало выходных: {len(off)}")
    return {"off": sorted(off), "short": sorted(short), "workWeekends": work_weekends}


def main():
    old = load_old() or {}
    years_old = old.get("years", {})
    this_year = datetime.now(timezone.utc).year
    years = {}
    errors = []
    fresh = 0  # сколько лет удалось получить заново

    for year in (this_year, this_year + 1):
        try:
            years[str(year)] = fetch_year(year)
            fresh += 1
            print(f"{year}: ок, нерабочих дней {len(years[str(year)]['off'])}")
        except Exception as e:  # сайт не ответил, нет года, битые данные
            errors.append(f"{year}: {e}")
            if str(year) in years_old:
                years[str(year)] = years_old[str(year)]
                print(f"{year}: ошибка ({e}) — оставляю прежние данные")
            else:
                print(f"{year}: ошибка ({e}) — данных за этот год пока нет")

    if not fresh:
        print("Источник не ответил ни по одному году — data.json не трогаю, приложение работает на прежних данных.")
        return 0

    data = {
        "source": "xmlcalendar (производственный календарь РФ)",
        "updated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "years": years,
        "errors": errors,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Сохранено: {OUT.name}, годы {', '.join(years)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
