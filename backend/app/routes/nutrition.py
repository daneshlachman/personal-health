from datetime import date, timedelta
from flask import Blueprint, request, jsonify
from app import db
from app.models import NutritionLog
from app.routes.chat import _ensure_user
from app.services.energy import local_today

nutrition_bp = Blueprint("nutrition", __name__)


@nutrition_bp.route("/nutrition", methods=["GET"])
def get_nutrition():
    user = _ensure_user()
    day_str = request.args.get("date", local_today().isoformat())
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


FREQUENT_WINDOW_DAYS = 21
FREQUENT_LIMIT = 12


@nutrition_bp.route("/nutrition/frequent", methods=["GET"])
def frequent_foods():
    """Items logged in the last weeks, for one-tap re-logging. Same description = same item;
    the most recent log supplies the macros. Items eaten at `meal` rank first."""
    user = _ensure_user()
    meal = request.args.get("meal")
    since = local_today() - timedelta(days=FREQUENT_WINDOW_DAYS)
    logs = (
        NutritionLog.query
        .filter(NutritionLog.user_id == user.id, NutritionLog.date >= since)
        .order_by(NutritionLog.date.desc(), NutritionLog.created_at.desc())
        .all()
    )
    items: dict = {}
    for l in logs:
        key = " ".join(l.description.lower().split())
        item = items.get(key)
        if item is None:
            item = items[key] = {**l.to_dict(), "count": 0, "meal_count": 0, "last_date": l.date.isoformat()}
        item["count"] += 1
        item["meal_count"] += l.meal_type == meal
    ranked = sorted(items.values(), key=lambda i: (i["meal_count"], i["count"], i["last_date"]), reverse=True)
    return jsonify(ranked[:FREQUENT_LIMIT])


@nutrition_bp.route("/nutrition", methods=["POST"])
def post_nutrition():
    user = _ensure_user()
    body = request.get_json(silent=True) or {}

    description = body.get("description", "").strip()
    if not description:
        return jsonify({"error": "description is required"}), 400

    log = NutritionLog(
        user_id=user.id,
        date=body.get("date", local_today().isoformat()),
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


@nutrition_bp.route("/nutrition/log-ai", methods=["POST"])
def log_ai():
    user = _ensure_user()
    body = request.get_json(silent=True) or {}
    description = body.get("description", "").strip()
    date_str = body.get("date", local_today().isoformat())
    meal_type = body.get("meal_type")

    if not description:
        return jsonify({"error": "description required"}), 400

    from app.services.claude import log_food_quick
    entries = log_food_quick(description, meal_type, date_str, user.id)
    return jsonify({"entries": [e.to_dict() for e in entries], "count": len(entries)})


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


def _day_status(user_id, day):
    from app.models import NutritionDayStatus
    from app.routes.profile import _latest_weight
    from app.services.energy import energy_for
    from app.services.logging_status import auto_complete, is_complete, COMPLETE_FRACTION
    consumed = round(sum(l.calories or 0 for l in NutritionLog.query.filter_by(user_id=user_id, date=day).all()))
    burned = energy_for(user_id, day, _latest_weight())["tdee"]
    row = NutritionDayStatus.query.filter_by(user_id=user_id, date=day).first()
    override = row.complete if row else None
    return {
        "date": day.isoformat(),
        "consumed": consumed,
        "burned": burned,
        "threshold": round(COMPLETE_FRACTION * burned),
        "auto_complete": auto_complete(consumed, burned),
        "override": override,
        "complete": is_complete(consumed, burned, override),
    }


@nutrition_bp.route("/nutrition/day-status", methods=["GET"])
def get_day_status():
    user = _ensure_user()
    try:
        day = date.fromisoformat(request.args.get("date", local_today().isoformat()))
    except ValueError:
        return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400
    return jsonify(_day_status(user.id, day))


@nutrition_bp.route("/nutrition/day-status", methods=["PUT"])
def put_day_status():
    """Mark a day as fully logged (true) or not (false); null returns it to the automatic rule."""
    from app.models import NutritionDayStatus
    user = _ensure_user()
    body = request.get_json(silent=True) or {}
    try:
        day = date.fromisoformat(body.get("date", ""))
    except ValueError:
        return jsonify({"error": "date (YYYY-MM-DD) is required"}), 400
    complete = body.get("complete")
    if complete not in (True, False, None):
        return jsonify({"error": "complete must be true, false or null"}), 400
    row = NutritionDayStatus.query.filter_by(user_id=user.id, date=day).first()
    if complete is None:
        if row:
            db.session.delete(row)
    elif row:
        row.complete = complete
    else:
        db.session.add(NutritionDayStatus(user_id=user.id, date=day, complete=complete))
    db.session.commit()
    return jsonify(_day_status(user.id, day))
