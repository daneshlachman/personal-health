from flask import Blueprint, jsonify, request
from app.routes.chat import _ensure_user
from app.services import whoop, garmin, hevy
from app.services.mfp import sync_weight as mfp_sync_weight

sync_bp = Blueprint("sync", __name__)


@sync_bp.route("/sync/whoop", methods=["POST"])
def sync_whoop():
    user = _ensure_user()
    days = int(request.args.get("days", 30))
    result = whoop.sync(user.id, days=days)
    return jsonify(result)


@sync_bp.route("/sync/garmin", methods=["POST"])
def sync_garmin():
    user = _ensure_user()
    result = garmin.sync(user.id)
    return jsonify(result)


@sync_bp.route("/sync/hevy", methods=["POST"])
def sync_hevy():
    user = _ensure_user()
    result = hevy.sync(user.id)
    return jsonify(result)


@sync_bp.route("/sync/mfp-weight", methods=["POST"])
def sync_mfp_weight():
    days = int(request.args.get("days", 30))
    result = mfp_sync_weight(days=days)
    return jsonify(result)
