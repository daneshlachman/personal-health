from flask import Blueprint, jsonify, request
from datetime import date, timedelta

from app import db
from app.models import WeightLog, Workout, NutritionLog, UserProfile
from app.routes.chat import _ensure_user
from app.services.energy import day_energy, energy_for, steps_by_day, typical_steps, TYPICAL_STEPS_WINDOW_DAYS

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


def _latest_weight() -> float:
    latest = WeightLog.query.filter_by(user_id=USER_ID).order_by(WeightLog.date.desc()).first()
    return latest.weight_kg if latest else 88


@profile_bp.route("/tdee/today", methods=["GET"])
def tdee_today():
    date_str = request.args.get("date")
    day = date.fromisoformat(date_str) if date_str else date.today()
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


@profile_bp.route("/calories/history", methods=["GET"])
def calories_history():
    days = int(request.args.get("days", 30))
    today = date.today()
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

    result = []
    current = start + timedelta(days=1)
    while current <= today:
        energy = day_energy(
            current, weight_kg, known_steps.get(current),
            typical_steps(USER_ID, current, known_steps), workouts_by_day.get(current, []),
        )
        burned = energy["tdee"]  # full-day value (for today: the estimate)
        consumed = round(consumed_by_day.get(current, 0))
        result.append({
            "date": current.isoformat(),
            "burned": burned,
            "consumed": consumed,
            "balance": consumed - burned if consumed > 0 else None,
        })
        current += timedelta(days=1)

    return jsonify(result)
