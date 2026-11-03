"""Whether a day's food log is complete enough to count in averages and balances.

Automatic: logged intake is at least COMPLETE_FRACTION of that day's burn (a day with
nothing, or only breakfast, logged doesn't count). A manual override per day wins.
"""
from datetime import date

from app.models import NutritionDayStatus

COMPLETE_FRACTION = 0.6


def overrides(user_id: str, start: date, end: date) -> dict:
    rows = NutritionDayStatus.query.filter(
        NutritionDayStatus.user_id == user_id, NutritionDayStatus.date >= start, NutritionDayStatus.date <= end
    ).all()
    return {r.date: r.complete for r in rows}


def auto_complete(consumed: float, burned: float) -> bool:
    return consumed > 0 and consumed >= COMPLETE_FRACTION * burned


def is_complete(consumed: float, burned: float, override: bool | None) -> bool:
    return override if override is not None else auto_complete(consumed, burned)
