from datetime import date
from flask import Blueprint, request, jsonify
from app import db
from app.models import NutritionLog
from app.routes.chat import _ensure_user

nutrition_bp = Blueprint("nutrition", __name__)


@nutrition_bp.route("/nutrition", methods=["GET"])
def get_nutrition():
    user = _ensure_user()
    day_str = request.args.get("date", date.today().isoformat())
    try:
        day = date.fromisoformat(day_str)
    except ValueError:
        return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400

    logs = (
        NutritionLog.query
        .filter_by(user_id=user.id, date=day)
        .order_by(NutritionLog.created_at)
        .all()
    )
    return jsonify([l.to_dict() for l in logs])


@nutrition_bp.route("/nutrition", methods=["POST"])
def post_nutrition():
    user = _ensure_user()
    body = request.get_json(silent=True) or {}

    description = body.get("description", "").strip()
    if not description:
        return jsonify({"error": "description is required"}), 400

    log = NutritionLog(
        user_id=user.id,
        date=body.get("date", date.today().isoformat()),
        meal_type=body.get("meal_type"),
        description=description,
        calories=body.get("calories"),
        protein_g=body.get("protein_g"),
        carbs_g=body.get("carbs_g"),
        fat_g=body.get("fat_g"),
    )
    db.session.add(log)
    db.session.commit()
    return jsonify(log.to_dict()), 201


@nutrition_bp.route("/nutrition/<log_id>", methods=["PUT"])
def update_nutrition(log_id):
    user = _ensure_user()
    log = NutritionLog.query.filter_by(id=log_id, user_id=user.id).first_or_404()
    body = request.get_json(silent=True) or {}
    if "calories"   in body: log.calories   = body["calories"]
    if "protein_g"  in body: log.protein_g  = body["protein_g"]
    if "carbs_g"    in body: log.carbs_g    = body["carbs_g"]
    if "fat_g"      in body: log.fat_g      = body["fat_g"]
    if "description" in body: log.description = body["description"]
    db.session.commit()
    return jsonify(log.to_dict())


@nutrition_bp.route("/nutrition/<log_id>", methods=["DELETE"])
def delete_nutrition(log_id):
    user = _ensure_user()
    log = NutritionLog.query.filter_by(id=log_id, user_id=user.id).first_or_404()
    db.session.delete(log)
    db.session.commit()
    return jsonify({"deleted": log_id})


@nutrition_bp.route("/nutrition/log-ai", methods=["POST"])
def log_ai():
    user = _ensure_user()
    body = request.get_json(silent=True) or {}
    description = body.get("description", "").strip()
    date_str = body.get("date", date.today().isoformat())
    meal_type = body.get("meal_type")

    if not description:
        return jsonify({"error": "description required"}), 400

    from app.services.claude import log_food_quick
    entries = log_food_quick(description, meal_type, date_str, user.id)
    return jsonify({"entries": [e.to_dict() for e in entries], "count": len(entries)})
