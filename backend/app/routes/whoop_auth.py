"""Whoop OAuth routes: /api/whoop/authorize and /api/whoop/callback."""
from flask import Blueprint, redirect, request, jsonify, current_app
from app import db
from app.routes.chat import _ensure_user
from app.services import whoop

whoop_bp = Blueprint("whoop", __name__)


def _frontend_url():
    from flask import current_app
    return current_app.config.get("FRONTEND_URL", "http://localhost:5173")


@whoop_bp.route("/whoop/authorize")
def authorize():
    user = _ensure_user()
    url = whoop.get_auth_url(
        redirect_uri=current_app.config["WHOOP_REDIRECT_URI"],
        client_id=current_app.config["WHOOP_CLIENT_ID"],
    )
    return redirect(url)


@whoop_bp.route("/whoop/callback")
def callback():
    code = request.args.get("code")
    error = request.args.get("error")

    if error or not code:
        return redirect(f"{_frontend_url()}?whoop_error=1")

    user = _ensure_user()
    try:
        whoop.exchange_code(code, user.id)
    except Exception as e:
        current_app.logger.error(f"Whoop token exchange failed: {e}")
        return redirect(f"{_frontend_url()}?whoop_error=1")

    return redirect(f"{_frontend_url()}?whoop_connected=1")


@whoop_bp.route("/whoop/status")
def status():
    user = _ensure_user()
    connected = whoop.is_connected(user.id)
    return jsonify({"connected": connected})


@whoop_bp.route("/whoop/disconnect", methods=["POST"])
def disconnect():
    from app.models import OAuthToken
    user = _ensure_user()
    OAuthToken.query.filter_by(user_id=user.id, provider="whoop").delete()
    db.session.commit()
    return jsonify({"status": "ok"})


@whoop_bp.route("/whoop/debug")
def debug():
    from app.services.whoop import _get_valid_token
    import requests
    user = _ensure_user()
    token = _get_valid_token(user.id)
    if not token:
        return jsonify({"error": "no token"})
    results = {}
    urls = [
        "https://api.prod.whoop.com/developer/v2/recovery",
        "https://api.prod.whoop.com/developer/v2/activity/sleep",
        "https://api.prod.whoop.com/developer/v2/sleep",
        "https://api.prod.whoop.com/developer/v2/body/measurement",
        "https://api.prod.whoop.com/developer/v2/user/profile/basic",
        "https://api.prod.whoop.com/developer/v2/profile",
    ]
    for url in urls:
        try:
            r = requests.get(url, headers={"Authorization": f"Bearer {token}"}, params={"limit": 1})
            results[url] = {"status": r.status_code, "body": r.text[:200]}
        except Exception as e:
            results[url] = {"error": str(e)}
    return jsonify(results)


@whoop_bp.route("/whoop/history")
def history():
    from app.models import WhoopData
    from datetime import date, timedelta
    user = _ensure_user()
    days = int(request.args.get("days", 30))
    since = date.today() - timedelta(days=days)
    records = (
        WhoopData.query
        .filter_by(user_id=user.id)
        .filter(WhoopData.date >= since)
        .order_by(WhoopData.date.asc())
        .all()
    )
    return jsonify([{
        "date": r.date.isoformat(),
        "recovery_score": r.recovery_score,
        "sleep_score": r.sleep_score,
        "hrv_ms": round(r.hrv_ms, 1) if r.hrv_ms else None,
        "resting_hr": r.resting_hr,
        "respiratory_rate": round(r.respiratory_rate, 1) if r.respiratory_rate else None,
        "sleep_duration_hours": round(r.sleep_duration_hours, 1) if r.sleep_duration_hours else None,
        "sleep_needed_hours": round(r.sleep_needed_hours, 1) if r.sleep_needed_hours else None,
        "sleep_consistency_pct": r.sleep_consistency_pct,
        "sleep_efficiency_pct": r.sleep_efficiency_pct,
        "sleep_disturbances": r.sleep_disturbances,
    } for r in records])


@whoop_bp.route("/whoop/today")
def today():
    from app.models import WhoopData
    from datetime import date
    user = _ensure_user()
    date_str = request.args.get("date")
    target = date.fromisoformat(date_str) if date_str else date.today()
    record = WhoopData.query.filter_by(user_id=user.id, date=target).first()
    if not record:
        return jsonify({"error": "no data"})
    return jsonify(record.to_dict())
