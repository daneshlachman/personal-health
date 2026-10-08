from flask import Blueprint, request, jsonify, current_app
from app.models import Workout
from app.routes.chat import _ensure_user

workouts_bp = Blueprint("workouts", __name__)


def _workout_with_exercises(w: Workout) -> dict:
    base = w.to_dict()
    raw = w.raw_json or {}
    exercises = []
    for ex in raw.get("exercises", []):
        sets = []
        for s in ex.get("sets", []):
            weight = s.get("weight_kg")
            reps = s.get("reps")
            if weight is not None or reps is not None:
                sets.append({
                    "weight_kg": weight,
                    "reps": reps,
                    "rpe": s.get("rpe"),
                    "type": s.get("set_type") or s.get("type", "normal"),
                })
        if sets:
            exercises.append({
                "title": ex.get("title", ex.get("exercise_template_id", "Exercise")),
                "sets": sets,
            })
    base["exercises"] = exercises
    base["raw_json"] = w.raw_json
    return base


@workouts_bp.route("/workouts/<workout_id>/route", methods=["GET"])
def get_route(workout_id):
    user = _ensure_user()
    workout = Workout.query.filter_by(id=workout_id, user_id=user.id, source="garmin").first_or_404()
    activity_id = (workout.raw_json or {}).get("activityId")
    if not activity_id:
        return jsonify({"error": "no activity id"}), 404
    try:
        from garminconnect import Garmin
        email = current_app.config.get("GARMIN_EMAIL", "")
        password = current_app.config.get("GARMIN_PASSWORD", "")
        from pathlib import Path
        token_path = Path(__file__).parent.parent.parent / ".garmin_token.json"
        client = Garmin(email, password)
        client.login(tokenstore=str(token_path.parent))
        details = client.get_activity_details(activity_id)
        polyline = (details.get("geoPolylineDTO", {}) or {}).get("polyline", [])
        points = [[p["lat"], p["lon"]] for p in polyline if p.get("lat") and p.get("lon")]

        # Build chart series from polyline metrics
        metrics = []
        start_ms = polyline[0].get("time", 0) if polyline else 0
        for i, p in enumerate(polyline):
            if i % 5 != 0:  # sample every 5th point to keep payload small
                continue
            elapsed_min = round((p.get("time", start_ms) - start_ms) / 60000, 1)
            speed_ms = p.get("speed")
            hr = p.get("heartRate")
            metrics.append({
                "t": elapsed_min,
                "hr": round(hr) if hr else None,
                "kmh": round(speed_ms * 3.6, 1) if speed_ms else None,
            })

        return jsonify({"points": points, "metrics": metrics})
    except Exception as e:
        current_app.logger.error(f"Route fetch failed: {e}")
        return jsonify({"error": str(e)}), 500


@workouts_bp.route("/workouts", methods=["GET"])
def get_workouts():
    user = _ensure_user()
    limit = min(int(request.args.get("limit", 20)), 100)
    workouts = (
        Workout.query
        .filter_by(user_id=user.id)
        .order_by(Workout.date.desc())
        .limit(limit)
        .all()
    )
    return jsonify([_workout_with_exercises(w) for w in workouts])


MAX_RECOMMENDATIONS_PER_DAY = 2
RECOMMENDATION_LOCK_ID = 7_301_002


def _parse_date(value):
    from datetime import date
    return date.fromisoformat(value) if value else date.today()


def _recommendation_state(user_id, target):
    from app.models import TrainingRecommendation
    rows = (
        TrainingRecommendation.query.filter_by(user_id=user_id, date=target)
        .order_by(TrainingRecommendation.created_at.desc()).all()
    )
    return {
        "date": target.isoformat(),
        "recommendation": rows[0].content if rows else None,
        "created_at": rows[0].created_at.isoformat() if rows else None,
        "remaining": max(0, MAX_RECOMMENDATIONS_PER_DAY - len(rows)),
    }


@workouts_bp.route("/workouts/recommendation", methods=["GET"])
def get_training_recommendation():
    user = _ensure_user()
    try:
        target = _parse_date(request.args.get("date"))
    except ValueError:
        return jsonify({"error": "invalid date"}), 400
    return jsonify(_recommendation_state(user.id, target))


@workouts_bp.route("/workouts/recommendation", methods=["POST"])
def training_recommendation():
    """Generate advice for a day. Max 2 per day; with auto=true only when none exists yet."""
    from sqlalchemy import text
    from app import db
    from app.models import TrainingRecommendation
    from app.services.coach import recommend_training, CoachError
    user = _ensure_user()
    body = request.get_json(silent=True) or {}
    try:
        target = _parse_date(body.get("date"))
    except ValueError:
        return jsonify({"error": "invalid date"}), 400

    # Serialize generation so two devices (or a double-fired effect) can't both spend a call
    db.session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": RECOMMENDATION_LOCK_ID})
    state = _recommendation_state(user.id, target)
    if body.get("auto") and state["recommendation"]:
        db.session.commit()
        return jsonify(state)
    if state["remaining"] == 0:
        db.session.commit()
        return jsonify({**state, "error": f"Max {MAX_RECOMMENDATIONS_PER_DAY} adviezen per dag"}), 429

    try:
        content = recommend_training(user.id, target)
    except CoachError as e:
        db.session.rollback()
        return jsonify({**state, "error": str(e)}), 502
    db.session.add(TrainingRecommendation(user_id=user.id, date=target, content=content))
    db.session.commit()
    return jsonify(_recommendation_state(user.id, target))
