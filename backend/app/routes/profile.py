from flask import Blueprint, jsonify, request
from datetime import date, datetime, timezone, timedelta

from app import db
from app.models import WeightLog, Workout, NutritionLog, UserProfile
from app.routes.chat import _ensure_user
from app.services.workout_utils import calc_workout_kcal

profile_bp = Blueprint("profile", __name__)

USER_ID = "00000000-0000-0000-0000-000000000001"

# Hardcoded user profile
HEIGHT_CM = 192
DATE_OF_BIRTH = date(1999, 10, 3)
AVG_DAILY_STEPS = 10000
DEFAULT_CALORIE_GOAL = 2400


def _get_profile():
    user = _ensure_user()
    profile = UserProfile.query.filter_by(user_id=user.id).first()
    if not profile:
        profile = UserProfile(user_id=user.id, calorie_goal=DEFAULT_CALORIE_GOAL)
        db.session.add(profile)
        db.session.commit()
    return profile


@profile_bp.route("/profile", methods=["GET"])
def get_profile():
    data = _get_profile().to_dict()
    if data["calorie_goal"] is None:
        data["calorie_goal"] = DEFAULT_CALORIE_GOAL
    return jsonify(data)


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
    if "goals" in body:
        goals = (body["goals"] or "").strip()
        if len(goals) > 2000:
            return jsonify({"error": "goals must be at most 2000 characters"}), 400
        profile.goals = goals or None
    db.session.commit()
    return jsonify(profile.to_dict())




@profile_bp.route("/tdee/today", methods=["GET"])
def tdee_today():
    date_str = request.args.get("date")
    today = date.fromisoformat(date_str) if date_str else date.today()

    latest_weight = (
        WeightLog.query.filter_by(user_id=USER_ID)
        .order_by(WeightLog.date.desc()).first()
    )
    weight_kg = latest_weight.weight_kg if latest_weight else 88

    age = (today - DATE_OF_BIRTH).days / 365.25
    bmr = 10 * weight_kg + 6.25 * HEIGHT_CM - 5 * age + 5
    step_kcal = AVG_DAILY_STEPS * 0.04 * (weight_kg / 70)
    tef = bmr * 0.10
    passive_total = bmr + step_kcal + tef

    # Workout calories today (deduplicated across sources)
    todays_workouts = Workout.query.filter_by(user_id=USER_ID, date=today).all()
    workout_kcal, _ = calc_workout_kcal(todays_workouts, weight_kg)

    tdee = round(passive_total + workout_kcal)

    # For past days show full TDEE; for today scale by time of day
    is_today = today == date.today()
    if is_today:
        now = datetime.now(timezone.utc).astimezone()
        minutes_elapsed = now.hour * 60 + now.minute
        time_fraction = minutes_elapsed / (24 * 60)
        burned_now = round(time_fraction * passive_total + workout_kcal)
    else:
        burned_now = tdee

    # Today's consumed calories
    nutrition = NutritionLog.query.filter_by(user_id=USER_ID, date=today).all()
    consumed = round(sum(n.calories or 0 for n in nutrition))
    balance = consumed - burned_now  # positive = surplus, negative = deficit

    return jsonify({
        "tdee": tdee,
        "burned_now": burned_now,
        "bmr": round(bmr),
        "step_kcal": round(step_kcal),
        "workout_kcal": round(workout_kcal),
        "consumed": consumed,
        "balance": balance,
        "weight_kg": weight_kg,
    })


@profile_bp.route("/calories/history", methods=["GET"])
def calories_history():
    days = int(request.args.get("days", 30))
    today = date.today()
    start = today - timedelta(days=days)

    latest_weight = (
        WeightLog.query.filter_by(user_id=USER_ID)
        .order_by(WeightLog.date.desc()).first()
    )
    weight_kg = latest_weight.weight_kg if latest_weight else 88
    age = (today - DATE_OF_BIRTH).days / 365.25
    bmr = 10 * weight_kg + 6.25 * HEIGHT_CM - 5 * age + 5
    step_kcal = AVG_DAILY_STEPS * 0.04 * (weight_kg / 70)
    tef = bmr * 0.10
    passive_total = round(bmr + step_kcal + tef)

    # Workout calories per day
    workouts = Workout.query.filter(
        Workout.user_id == USER_ID,
        Workout.date >= start,
        Workout.date <= today
    ).all()
    # Group workouts by day, then dedup per day
    workouts_by_day: dict[str, list] = {}
    for w in workouts:
        d = w.date.isoformat()
        workouts_by_day.setdefault(d, []).append(w)
    workout_by_day = {d: calc_workout_kcal(ws, weight_kg)[0] for d, ws in workouts_by_day.items()}

    # Consumed per day
    nutrition = NutritionLog.query.filter(
        NutritionLog.user_id == USER_ID,
        NutritionLog.date >= start,
        NutritionLog.date <= today
    ).all()
    consumed_by_day = {}
    for n in nutrition:
        d = n.date.isoformat()
        consumed_by_day[d] = consumed_by_day.get(d, 0) + (n.calories or 0)

    result = []
    current = start + timedelta(days=1)
    while current <= today:
        d = current.isoformat()
        workout_kcal = workout_by_day.get(d, 0)
        burned = passive_total + workout_kcal
        consumed = round(consumed_by_day.get(d, 0))
        result.append({
            "date": d,
            "burned": burned,
            "consumed": consumed,
            "balance": consumed - burned if consumed > 0 else None,
        })
        current += timedelta(days=1)

    return jsonify(result)
