"""Garmin Connect integration via garminconnect (unofficial)."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import current_app
from sqlalchemy import text
from garminconnect import Garmin

from app import db
from app.models import Workout

TOKEN_PATH = Path(__file__).parent.parent.parent / ".garmin_token.json"
GARMIN_SYNC_LOCK_ID = 7_301_004

SKIP_ACTIVITY_TYPES = {
    "walking", "casual_walking", "speed_walking",
    "other", "uncategorized", "unknown",
}

CYCLING_TYPES = {
    "cycling", "indoor_cycling", "bike_indoor",
    "mountain_biking", "gravel_cycling", "road_biking",
    "virtual_ride", "e_bike_riding",
}

STRENGTH_TYPES = {
    "strength_training", "fitness_equipment", "weight_training",
    "crossfit", "hiit",
}

SPORT_NAME_MAP = {
    **{k: "Cycling" for k in CYCLING_TYPES},
    **{k: "Strength Training" for k in STRENGTH_TYPES},
    "running": "Running",
    "trail_running": "Running",
    "treadmill_running": "Running",
    "indoor_running": "Running",
    "rowing": "Rowing",
    "swimming": "Swimming",
    "yoga": "Yoga",
}


def _get_client() -> Garmin:
    email = current_app.config.get("GARMIN_EMAIL", "")
    password = current_app.config.get("GARMIN_PASSWORD", "")
    if not email or not password:
        raise ValueError("GARMIN_EMAIL and GARMIN_PASSWORD not configured")

    client = Garmin(email, password)
    # tokenstore saves session so we don't re-login every time
    client.login(tokenstore=str(TOKEN_PATH.parent))
    return client


def sync(user_id: str, days: int = 30) -> dict:
    email = current_app.config.get("GARMIN_EMAIL", "")
    password = current_app.config.get("GARMIN_PASSWORD", "")
    if not email or not password:
        return {"status": "error", "message": "GARMIN_EMAIL/PASSWORD not configured"}

    try:
        client = _get_client()
    except Exception as e:
        return {"status": "error", "message": f"Garmin login failed: {e}"}

    try:
        activities = client.get_activities(0, min(days * 2, 100))
    except Exception as e:
        TOKEN_PATH.unlink(missing_ok=True)
        return {"status": "error", "message": f"Garmin API error: {e}"}

    # Serialize syncs (Workouts screen + pre-advice sync can overlap); released at commit
    db.session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": GARMIN_SYNC_LOCK_ID})

    existing_ids = {}
    for w in Workout.query.filter_by(user_id=user_id, source="garmin").order_by(Workout.created_at).all():
        if not w.raw_json:
            continue
        if w.raw_json.get("activityId") in existing_ids:
            db.session.delete(w)  # duplicate from an earlier concurrent sync
        else:
            existing_ids[w.raw_json.get("activityId")] = w

    upserted = 0
    for act in activities:
        activity_id = act.get("activityId")
        if not activity_id:
            continue

        type_key = (act.get("activityType", {}).get("typeKey", "") or "").lower()

        if type_key in SKIP_ACTIVITY_TYPES:
            continue

        display_name = SPORT_NAME_MAP.get(type_key)
        if not display_name:
            continue
        # Use Garmin's own activity name if available (e.g. "Amsterdam Cycling")
        display_name = act.get("activityName") or display_name

        try:
            start_str = act.get("startTimeLocal") or act.get("startTimeGMT", "")
            start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00").replace(" ", "T"))
            activity_date = start_dt.date()
        except (ValueError, AttributeError, TypeError):
            continue

        duration_secs = act.get("duration") or act.get("movingDuration") or 0
        duration_min = int(duration_secs / 60) if duration_secs else None

        existing = existing_ids.get(activity_id)
        if existing:
            existing.title = display_name
            existing.duration_minutes = duration_min
            existing.raw_json = act
            existing.date = activity_date
        else:
            db.session.add(Workout(
                user_id=user_id,
                date=activity_date,
                source="garmin",
                title=display_name,
                duration_minutes=duration_min,
                raw_json=act,
            ))
        upserted += 1

    db.session.commit()
    return {"status": "ok", "activities_synced": upserted}
