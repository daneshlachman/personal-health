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


@workouts_bp.route("/workouts/recommendation", methods=["POST"])
def training_recommendation():
    from datetime import date
    from app.services.coach import recommend_training, CoachError
    user = _ensure_user()
    body = request.get_json(silent=True) or {}
    try:
        target = date.fromisoformat(body["date"]) if body.get("date") else date.today()
    except ValueError:
        return jsonify({"error": "invalid date"}), 400
    try:
        text = recommend_training(user.id, target)
    except CoachError as e:
        return jsonify({"error": str(e)}), 502
    return jsonify({"date": target.isoformat(), "recommendation": text})
