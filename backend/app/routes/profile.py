from flask import Blueprint, jsonify, request
from datetime import date, timedelta

from app import db
from app.models import WeightLog, Workout, NutritionLog, UserProfile
from app.routes.chat import _ensure_user
from app.services.logging_status import is_complete, auto_complete, overrides
from app.services.energy import current_factor, day_energy, energy_for, local_today, steps_by_day, typical_steps, TYPICAL_STEPS_WINDOW_DAYS

profile_bp = Blueprint("profile", __name__)

USER_ID = "00000000-0000-0000-0000-000000000001"

DEFAULT_CALORIE_GOAL = 2400


def _get_profile():
    user = _ensure_user()
    profile = UserProfile.query.filter_by(user_id=user.id).first()
    if not profile:
        profile = UserProfile(user_id=user.id, calorie_goal=DEFAULT_CALORIE_GOAL)
        db.session.add(profile)
        db.session.commit()
    return profile


PROTEIN_G_PER_KG = 2.0
FAT_G_PER_KG = 0.8


def _macro_goals(profile) -> dict:
    """Protein and fat from the profile or body weight; carbs fill the rest of the calorie goal."""
    weight = _latest_weight()
    kcal = profile.calorie_goal or DEFAULT_CALORIE_GOAL
    protein = profile.protein_goal_g or round(PROTEIN_G_PER_KG * weight)
    fat = profile.fat_goal_g or round(FAT_G_PER_KG * weight)
    carbs = max(0, round((kcal - 4 * protein - 9 * fat) / 4))
    return {"calories": kcal, "protein_g": protein, "fat_g": fat, "carbs_g": carbs}


def _profile_response(profile):
    data = profile.to_dict()
    if data["calorie_goal"] is None:
        data["calorie_goal"] = DEFAULT_CALORIE_GOAL
    data["macro_goals"] = _macro_goals(profile)
    return data


@profile_bp.route("/profile", methods=["GET"])
def get_profile():
    return jsonify(_profile_response(_get_profile()))


@profile_bp.route("/profile", methods=["PUT"])
def update_profile():
    profile = _get_profile()
    body = request.get_json(silent=True) or {}
    if "calorie_goal" in body:
        try:
            goal = int(body["calorie_goal"])
        except (TypeError, ValueError):
            return jsonify({"error": "calorie_goal must be a number"}), 400
        if not 800 <= goal <= 6000:
            return jsonify({"error": "calorie_goal must be between 800 and 6000"}), 400
        profile.calorie_goal = goal
    if "adaptive_tdee" in body:
        profile.adaptive_tdee = bool(body["adaptive_tdee"])
    for field, (lo, hi) in {"protein_goal_g": (30, 400), "fat_goal_g": (20, 300)}.items():
        if field in body:
            if body[field] in (None, ""):
                setattr(profile, field, None)
                continue
            try:
                value = int(body[field])
            except (TypeError, ValueError):
                return jsonify({"error": f"{field} must be a number"}), 400
            if not lo <= value <= hi:
                return jsonify({"error": f"{field} must be between {lo} and {hi}"}), 400
            setattr(profile, field, value)
    if "goals" in body:
        goals = (body["goals"] or "").strip()
        if len(goals) > 2000:
            return jsonify({"error": "goals must be at most 2000 characters"}), 400
        profile.goals = goals or None
    db.session.commit()
    if "adaptive_tdee" in body:
        refresh_tdee_factor(force=True)
    return jsonify(_profile_response(profile))


def _latest_weight() -> float:
    latest = WeightLog.query.filter_by(user_id=USER_ID).order_by(WeightLog.date.desc()).first()
    return latest.weight_kg if latest else 88


@profile_bp.route("/tdee/today", methods=["GET"])
def tdee_today():
    date_str = request.args.get("date")
    try:
        day = date.fromisoformat(date_str) if date_str else local_today()
    except ValueError:
        return jsonify({"error": "invalid date"}), 400
    weight_kg = _latest_weight()

    energy = energy_for(USER_ID, day, weight_kg)

    nutrition = NutritionLog.query.filter_by(user_id=USER_ID, date=day).all()
    consumed = round(sum(n.calories or 0 for n in nutrition))
    balance = consumed - energy["burned_now"]  # positive = surplus, negative = deficit

    return jsonify({
        "tdee": energy["tdee"],
        "burned_now": energy["burned_now"],
        "bmr": energy["bmr"],
        "step_kcal": energy["step_kcal"],
        "steps": energy["steps"],
        "steps_source": energy["steps_source"],
        "workout_kcal": energy["workout_kcal"],
        "consumed": consumed,
        "balance": balance,
        "weight_kg": weight_kg,
    })


def _calorie_days(days: int) -> list[dict]:
    """Burned vs consumed per day for the last `days` days, today included."""
    today = local_today()
    start = today - timedelta(days=days)
    weight_kg = _latest_weight()

    known_steps = steps_by_day(USER_ID, start - timedelta(days=TYPICAL_STEPS_WINDOW_DAYS), today)

    workouts = Workout.query.filter(
        Workout.user_id == USER_ID, Workout.date >= start, Workout.date <= today
    ).all()
    workouts_by_day: dict = {}
    for w in workouts:
        workouts_by_day.setdefault(w.date, []).append(w)

    nutrition = NutritionLog.query.filter(
        NutritionLog.user_id == USER_ID, NutritionLog.date >= start, NutritionLog.date <= today
    ).all()
    consumed_by_day: dict = {}
    for n in nutrition:
        consumed_by_day[n.date] = consumed_by_day.get(n.date, 0) + (n.calories or 0)

    manual = overrides(USER_ID, start, today)
    factor = current_factor(USER_ID)
    result = []
    current = start + timedelta(days=1)
    while current <= today:
        energy = day_energy(
            current, weight_kg, known_steps.get(current),
            typical_steps(USER_ID, current, known_steps), workouts_by_day.get(current, []),
            factor=factor,
        )
        burned = energy["tdee"]  # full-day value (for today: the estimate)
        consumed = round(consumed_by_day.get(current, 0))
        complete = is_complete(consumed, burned, manual.get(current))
        result.append({
            "date": current.isoformat(),
            "burned": burned,
            "burned_raw": energy["tdee_raw"],
            "consumed": consumed,
            # Incomplete days have no meaningful balance: they'd show a fake deficit
            "complete": complete,
            "auto_complete": auto_complete(consumed, burned),
            "override": manual.get(current),
            "balance": consumed - burned if complete else None,
            # How `burned` adds up; steps is the remainder so the parts always sum exactly
            "breakdown": {
                "bmr": energy["bmr"],
                "tef": energy["tef"],
                "steps": energy["steps"],
                "steps_source": energy["steps_source"],
                "workout_steps": energy["workout_steps"],
                "full_day_steps": energy["full_day_steps"],
                "step_kcal": energy["tdee_raw"] - energy["bmr"] - energy["tef"] - energy["workout_kcal"],
                "workout_kcal": energy["workout_kcal"],
                "workouts": energy["workouts"],
                "adaptive": burned - energy["tdee_raw"],
            },
        })
        current += timedelta(days=1)
    return result


@profile_bp.route("/calories/history", methods=["GET"])
def calories_history():
    rows = _calorie_days(int(request.args.get("days", 30)))
    # Days that aren't fully logged get an intake estimate: that day's burn plus the
    # average surplus the weight trend puts on unlogged days (last 28 days). Rough on
    # purpose: a single day's weight says nothing; this is the period's pattern.
    est = _intake_estimate(history=rows)
    surplus = est.get("unlogged_surplus") if est.get("ready") else None
    today = local_today().isoformat()
    for r in rows:
        r["consumed_estimated"] = (
            max(r["consumed"], r["burned_raw"] + surplus)
            if surplus is not None and not r["complete"] and r["date"] < today else None
        )
    return jsonify(rows)


CALIBRATION_DAYS = 28
MIN_LOGGED_DAYS = 14
MIN_WEIGHINS = 6
KCAL_PER_KG = 7700


FACTOR_MIN, FACTOR_MAX = 0.75, 1.15  # never let one odd month swing the estimate wildly
FACTOR_REFRESH_DAYS = 7


def _weight_slope(weights: list, since: date) -> float:
    """Least-squares slope of weight over time (kg/day): far less noisy than first vs last."""
    xs = [(w.date - since).days for w in weights]
    ys = [w.weight_kg for w in weights]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    var = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / var if var else 0


def _calibration(days: int = CALIBRATION_DAYS) -> dict:
    """Check the burn estimate against reality: the weight trend says what the real
    average balance was, so real burn = average intake - weight change x 7700 kcal/kg.
    Only fully logged days count for intake (services/logging_status.py); today is left
    out (still being logged). Compares against the unscaled estimate (burned_raw)."""
    today = local_today()
    since = today - timedelta(days=days)
    rows = [r for r in _calorie_days(days) if r["date"] < today.isoformat()]
    logged = [r for r in rows if r["complete"]]
    weights = (
        WeightLog.query.filter(WeightLog.user_id == USER_ID, WeightLog.date > since)
        .order_by(WeightLog.date).all()
    )
    result = {"days": days, "logged_days": len(logged), "weigh_ins": len(weights),
              "min_logged_days": MIN_LOGGED_DAYS, "min_weigh_ins": MIN_WEIGHINS}
    if len(logged) < MIN_LOGGED_DAYS or len(weights) < MIN_WEIGHINS:
        return {**result, "ready": False}

    slope = _weight_slope(weights, since)
    intake = sum(r["consumed"] for r in logged) / len(logged)
    estimated = sum(r["burned_raw"] for r in logged) / len(logged)
    measured = intake - slope * KCAL_PER_KG
    return {
        **result,
        "ready": True,
        "avg_intake": round(intake),
        "avg_burned_estimated": round(estimated),
        "avg_burned_measured": round(measured),
        "weight_change_kg_per_week": round(slope * 7, 2),
        "factor": round(measured / estimated, 3),
    }


def refresh_tdee_factor(force: bool = False):
    """Store the weight-trend correction (at most weekly), used by every burn number."""
    profile = _get_profile()
    if profile.adaptive_tdee is False:
        return
    if not force and profile.tdee_factor_updated and (local_today() - profile.tdee_factor_updated).days < FACTOR_REFRESH_DAYS:
        return
    cal = _calibration()
    if not cal["ready"]:
        return
    profile.tdee_factor = round(min(FACTOR_MAX, max(FACTOR_MIN, cal["factor"])), 3)
    profile.tdee_factor_updated = local_today()
    db.session.commit()


def _intake_estimate(days: int = CALIBRATION_DAYS, history: list | None = None) -> dict:
    """What was eaten according to the scale: average intake = average burn + weight trend
    x 7700 kcal/kg, over all days (logged or not). Minus what the fully logged days account
    for, the rest is what the unlogged days must have averaged. Today is left out. Uses the
    unscaled burn: the adaptive factor is itself derived from the weight trend."""
    today = local_today()
    since = today - timedelta(days=days)
    # `history` (newest last) saves recomputing the days when the caller already has them
    rows = [r for r in (history if history is not None else _calorie_days(days))
            if since.isoformat() < r["date"] < today.isoformat()]
    logged = [r for r in rows if r["complete"]]
    unlogged = [r for r in rows if not r["complete"]]
    weights = (
        WeightLog.query.filter(WeightLog.user_id == USER_ID, WeightLog.date > since)
        .order_by(WeightLog.date).all()
    )
    result = {"days": len(rows), "logged_days": len(logged), "unlogged_days": len(unlogged),
              "weigh_ins": len(weights), "min_weigh_ins": MIN_WEIGHINS}
    if len(weights) < MIN_WEIGHINS or not rows:
        return {**result, "ready": False}

    slope = _weight_slope(weights, since)
    burned = sum(r["burned_raw"] for r in rows) / len(rows)
    intake = burned + slope * KCAL_PER_KG
    logged_intake = sum(r["consumed"] for r in logged) / len(logged) if logged else None
    unlogged_intake = None
    if unlogged:
        unlogged_burned = sum(r["burned_raw"] for r in unlogged) / len(unlogged)
        total_unlogged = intake * len(rows) - sum(r["consumed"] for r in logged)
        unlogged_intake = total_unlogged / len(unlogged)
    return {
        **result,
        "ready": True,
        "weight_change_kg_per_week": round(slope * 7, 2),
        "avg_burned": round(burned),
        "avg_intake_estimated": round(intake),
        "avg_intake_logged_days": round(logged_intake) if logged_intake is not None else None,
        "avg_intake_unlogged_days": round(unlogged_intake) if unlogged_intake is not None else None,
        "avg_burned_unlogged_days": round(unlogged_burned) if unlogged else None,
        # What unlogged days ate on top of what they burned, used for per-day estimates
        "unlogged_surplus": round(unlogged_intake - unlogged_burned) if unlogged else None,
    }


@profile_bp.route("/calories/intake-estimate", methods=["GET"])
def calories_intake_estimate():
    return jsonify(_intake_estimate(int(request.args.get("days", CALIBRATION_DAYS))))


@profile_bp.route("/calories/calibration", methods=["GET"])
def calories_calibration():
    refresh_tdee_factor()
    profile = _get_profile()
    return jsonify({
        **_calibration(int(request.args.get("days", CALIBRATION_DAYS))),
        "adaptive": profile.adaptive_tdee is not False,
        "applied_factor": current_factor(USER_ID),
        "applied_since": profile.tdee_factor_updated.isoformat() if profile.tdee_factor_updated else None,
    })
