from datetime import datetime, timedelta

from app.models import Workout


def _naive(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _workout_window(w: Workout):
    raw = w.raw_json or {}
    try:
        if w.source == "garmin":
            start_str = raw.get("startTimeGMT") or raw.get("startTimeLocal", "")
            start = _naive(datetime.fromisoformat(start_str.replace("Z", "+00:00").replace(" ", "T")))
            duration_secs = raw.get("duration") or raw.get("movingDuration") or 0
            return start, start + timedelta(seconds=duration_secs)
        elif w.source == "hevy":
            start_str = raw.get("start_time") or raw.get("created_at", "")
            end_str = raw.get("end_time", "")
            start = _naive(datetime.fromisoformat(start_str.replace("Z", "+00:00")))
            end = _naive(datetime.fromisoformat(end_str.replace("Z", "+00:00")))
            return start, end
        elif w.source == "whoop":
            start = _naive(datetime.fromisoformat(raw["start"].replace("Z", "+00:00")))
            end = _naive(datetime.fromisoformat(raw["end"].replace("Z", "+00:00")))
            return start, end
    except (KeyError, ValueError, TypeError):
        pass
    return None, None


def _overlaps(a_start, a_end, b_start, b_end, tolerance_minutes=10) -> bool:
    if None in (a_start, a_end, b_start, b_end):
        return False
    tol = timedelta(minutes=tolerance_minutes)
    return a_start < b_end + tol and a_end + tol > b_start


def dedupe_workouts(workouts: list) -> list:
    """Return only the highest-priority workout per overlapping time window (Garmin > Hevy > Whoop)."""
    SOURCE_PRIORITY = {"garmin": 0, "hevy": 1, "whoop": 2}

    entries = []
    for w in workouts:
        start, end = _workout_window(w)
        entries.append((SOURCE_PRIORITY.get(w.source, 9), start, end, w))

    entries.sort(key=lambda x: x[0])

    accepted = []
    for priority, start, end, w in entries:
        shadowed = any(
            _overlaps(start, end, a_start, a_end)
            for _, a_start, a_end, _ in accepted
        )
        if not shadowed:
            accepted.append((priority, start, end, w))

    # Keep the input order (e.g. newest first)
    keep = {id(w) for _, _, _, w in accepted}
    return [w for w in workouts if id(w) in keep]


def calc_workout_kcal(workouts: list, weight_kg: float,
                      resting_kcal_per_min: float = 0) -> tuple[int, list[str]]:
    """Sum workout calories, deduplicating overlapping sources (Garmin > Hevy > Whoop).
    Whoop's HR-based kcal clearly underestimate strength training, so Hevy's MET estimate wins.
    Device kcal are gross; the resting part is subtracted because BMR + TEF already
    cover the whole day. Returns (total_kcal, list of description strings for context)."""
    SOURCE_PRIORITY = {"garmin": 0, "hevy": 1, "whoop": 2}

    entries = []
    for w in workouts:
        raw = w.raw_json or {}
        cal = 0
        note = ""
        if w.source == "garmin" and raw.get("calories"):
            cal = raw["calories"]
            note = f"{w.title} {cal} kcal (Garmin)"
        elif w.source == "hevy" and w.duration_minutes:
            cal = round(4 * weight_kg * (w.duration_minutes / 60))  # ~4 MET incl. rest between sets
            note = f"{w.title} ~{cal} kcal (Hevy estimate)"
        elif w.source == "whoop":
            kj = (raw.get("score") or {}).get("kilojoule")
            if kj:
                cal = round(kj / 4.184)
                note = f"{w.title} {cal} kcal (Whoop)"
        if cal:
            cal = max(0, round(cal - resting_kcal_per_min * (w.duration_minutes or 0)))
            note += f", {cal} kcal net" if resting_kcal_per_min else ""
            start, end = _workout_window(w)
            entries.append((SOURCE_PRIORITY.get(w.source, 9), start, end, cal, note))

    entries.sort(key=lambda x: x[0])

    accepted = []
    total = 0
    notes = []
    for priority, start, end, cal, note in entries:
        shadowed = any(
            _overlaps(start, end, a_start, a_end)
            for _, a_start, a_end, _, _ in accepted
        )
        if not shadowed:
            accepted.append((priority, start, end, cal, note))
            total += cal
            notes.append(note)

    return total, notes
