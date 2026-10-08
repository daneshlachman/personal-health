"""Daily energy expenditure: BMR + TEF + steps (Whoop) + workouts.

Shared by the dashboard (/tdee/today), the calorie history and the chat context.
"""
from datetime import date, datetime, timedelta, timezone

from app.models import WhoopData, Workout, UserProfile
from app.services.workout_utils import calc_workout_kcal

# Hardcoded profile (single user)
HEIGHT_CM = 192
DATE_OF_BIRTH = date(1999, 10, 3)
DEFAULT_DAILY_STEPS = 10000
KCAL_PER_STEP_AT_70KG = 0.04
TYPICAL_STEPS_WINDOW_DAYS = 14


def bmr_for(weight_kg: float, day: date) -> float:
    age = (day - DATE_OF_BIRTH).days / 365.25
    return 10 * weight_kg + 6.25 * HEIGHT_CM - 5 * age + 5  # Mifflin-St Jeor, male


def step_kcal(steps: float, weight_kg: float) -> float:
    return steps * KCAL_PER_STEP_AT_70KG * (weight_kg / 70)


def workout_steps(workouts: list) -> int:
    """Steps recorded inside workouts (Garmin runs/walks). Their calories are already
    counted as workout kcal, so they're subtracted from the daily step count."""
    return sum(int((w.raw_json or {}).get("steps") or 0) for w in workouts if w.source == "garmin")


def steps_by_day(user_id: str, start: date, end: date) -> dict:
    rows = (
        WhoopData.query.filter_by(user_id=user_id)
        .filter(WhoopData.date >= start, WhoopData.date <= end, WhoopData.step_count.isnot(None))
        .all()
    )
    return {r.date: r.step_count for r in rows}


def typical_steps(user_id: str, day: date, known: dict | None = None) -> int:
    """Average Whoop steps over the days before `day`; profile/default when there is no data."""
    start = day - timedelta(days=TYPICAL_STEPS_WINDOW_DAYS)
    known = known if known is not None else steps_by_day(user_id, start, day - timedelta(days=1))
    values = [s for d, s in known.items() if start <= d < day]
    if values:
        return round(sum(values) / len(values))
    profile = UserProfile.query.filter_by(user_id=user_id).first()
    return (profile.avg_daily_steps if profile and profile.avg_daily_steps else None) or DEFAULT_DAILY_STEPS


def day_energy(day: date, weight_kg: float, steps: int | None, typical: int, workouts: list,
               now: datetime | None = None) -> dict:
    """Energy for one day. `steps` is the Whoop count (None if unknown); for today it is
    the count so far. Returns the full-day estimate and, for today, what's burned so far."""
    bmr = bmr_for(weight_kg, day)
    tef = bmr * 0.10
    w_kcal, w_notes = calc_workout_kcal(workouts, weight_kg)
    w_steps = workout_steps(workouts)

    measured = steps is not None
    steps_day = steps if measured else typical
    non_workout_steps = max(0, steps_day - w_steps)

    now = now or datetime.now(timezone.utc).astimezone()
    is_today = day == now.date()
    if is_today:
        fraction = (now.hour * 60 + now.minute) / (24 * 60)
        if measured:
            steps_kcal_now = step_kcal(non_workout_steps, weight_kg)
            # Full day: at least what you've done, at least a typical day
            full_day_steps = max(non_workout_steps, typical - w_steps, 0)
        else:
            steps_kcal_now = fraction * step_kcal(non_workout_steps, weight_kg)
            full_day_steps = non_workout_steps
        burned_now = fraction * (bmr + tef) + steps_kcal_now + w_kcal
        tdee = bmr + tef + step_kcal(full_day_steps, weight_kg) + w_kcal
        s_kcal = steps_kcal_now
    else:
        s_kcal = step_kcal(non_workout_steps, weight_kg)
        tdee = burned_now = bmr + tef + s_kcal + w_kcal

    return {
        "tdee": round(tdee),
        "burned_now": round(burned_now),
        "bmr": round(bmr),
        "tef": round(tef),
        "step_kcal": round(s_kcal),
        "steps": steps_day,
        "steps_source": "whoop" if measured else "estimate",
        "workout_steps": w_steps,
        "workout_kcal": round(w_kcal),
        "workout_notes": w_notes,
    }


def energy_for(user_id: str, day: date, weight_kg: float) -> dict:
    """Convenience wrapper that loads steps and workouts for a single day."""
    window_start = day - timedelta(days=TYPICAL_STEPS_WINDOW_DAYS)
    known = steps_by_day(user_id, window_start, day)
    workouts = Workout.query.filter_by(user_id=user_id, date=day).all()
    return day_energy(day, weight_kg, known.get(day), typical_steps(user_id, day, known), workouts)
