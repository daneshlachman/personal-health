from datetime import date, timedelta
from flask import Blueprint, request, jsonify
from app import db
from app.models import WeightLog
from app.routes.chat import _ensure_user
from app.services.energy import local_today

weight_bp = Blueprint("weight", __name__)


@weight_bp.route("/weight", methods=["GET"])
def get_weight():
    user = _ensure_user()
    days = int(request.args.get("days", 30))
    since = local_today() - timedelta(days=days)
    logs = (
        WeightLog.query
        .filter_by(user_id=user.id)
        .filter(WeightLog.date >= since)
        .order_by(WeightLog.date.asc())
        .all()
    )
    return jsonify([l.to_dict() for l in logs])


@weight_bp.route("/weight", methods=["POST"])
def post_weight():
    user = _ensure_user()
    body = request.get_json(silent=True) or {}

    weight_kg = body.get("weight_kg")
    if weight_kg is None:
        return jsonify({"error": "weight_kg is required"}), 400

    log = WeightLog(
        user_id=user.id,
        date=body.get("date", local_today().isoformat()),
        weight_kg=float(weight_kg),
        source=body.get("source", "manual"),
        photo_data=body.get("photo_data"),
    )
    db.session.add(log)
    db.session.commit()
    return jsonify(log.to_dict()), 201


@weight_bp.route("/weight/<log_id>", methods=["PUT"])
def update_weight(log_id):
    user = _ensure_user()
    log = WeightLog.query.filter_by(id=log_id, user_id=user.id).first_or_404()
    body = request.get_json(silent=True) or {}

    if "weight_kg" in body:
        log.weight_kg = float(body["weight_kg"])
    if "date" in body:
        log.date = body["date"]
    if "photo_data" in body:
        log.photo_data = body["photo_data"]

    db.session.commit()
    return jsonify(log.to_dict())


@weight_bp.route("/weight/<log_id>", methods=["DELETE"])
def delete_weight(log_id):
    user = _ensure_user()
    log = WeightLog.query.filter_by(id=log_id, user_id=user.id).first_or_404()
    db.session.delete(log)
    db.session.commit()
    return "", 204
