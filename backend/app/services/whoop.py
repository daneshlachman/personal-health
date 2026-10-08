"""Whoop OAuth 2.0 integration and data sync."""
import os
from datetime import datetime, timezone, timedelta, date

import requests
from flask import current_app
from sqlalchemy import text

from app import db
from app.models import OAuthToken, WhoopData, WeightLog, Workout, User

# Whoop sport IDs → category for frontend display
# https://developer.whoop.com/docs/developing/data-models/workout
STRENGTH_SPORT_IDS = {
    44,   # Weightlifting
    63,   # Functional Fitness
    70,   # CrossFit
    126,  # Powerlifting
    164,  # Olympic Weightlifting
    234,  # Strength Training
    304,  # Bodybuilding
}

CYCLING_SPORT_IDS = {
    2,    # Cycling
    71,   # Mountain Biking
    287,  # Road Cycling
    288,  # Indoor Cycling
    289,  # BMX
}

# sport_id 0 = unlabeled Activity — skip these
SKIP_SPORT_IDS = {0, -1}

SPORT_NAMES = {
    1: "Running", 2: "Cycling", 51: "Swimming", 57: "Football",
    63: "Functional Fitness", 70: "CrossFit", 71: "Mountain Biking",
    74: "Tennis", 82: "Yoga", 93: "Basketball", 96: "Soccer",
    126: "Powerlifting", 164: "Olympic Weightlifting", 170: "HIIT",
    176: "Rowing", 234: "Strength Training", 287: "Road Cycling",
    288: "Indoor Cycling", 289: "BMX", 304: "Bodybuilding",
    44: "Weightlifting",
}

WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v2"

SCOPES = "offline read:recovery read:sleep read:body_measurement read:cycles read:workout"


def get_auth_url(redirect_uri: str, client_id: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": "whoop_auth",
    }
    query = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{WHOOP_AUTH_URL}?{query}"


def exchange_code(code: str, user_id: str) -> dict:
    client_id = current_app.config["WHOOP_CLIENT_ID"]
    client_secret = current_app.config["WHOOP_CLIENT_SECRET"]
    redirect_uri = current_app.config["WHOOP_REDIRECT_URI"]

    resp = requests.post(WHOOP_TOKEN_URL, data={
        "grant_type": "authorization_code",
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
    })
    resp.raise_for_status()
    data = resp.json()
    _save_token(user_id, data)
    return data


def _save_token(user_id: str, token_data: dict):
    expires_in = token_data.get("expires_in", 3600)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

    token = OAuthToken.query.filter_by(user_id=user_id, provider="whoop").first()
    if token:
        token.access_token = token_data["access_token"]
        token.refresh_token = token_data.get("refresh_token", token.refresh_token)
        token.expires_at = expires_at
        token.updated_at = datetime.now(timezone.utc)
    else:
        token = OAuthToken(
            user_id=user_id,
            provider="whoop",
            access_token=token_data["access_token"],
            refresh_token=token_data.get("refresh_token"),
            expires_at=expires_at,
        )
        db.session.add(token)
    db.session.commit()


def _token_expiring(token: OAuthToken) -> bool:
    return bool(token.expires_at) and token.expires_at <= datetime.now(timezone.utc) + timedelta(minutes=5)


def _get_valid_token(user_id: str) -> str | None:
    token = OAuthToken.query.filter_by(user_id=user_id, provider="whoop").first()
    if not token:
        return None

    # Refresh if expiring within 5 minutes
    if _token_expiring(token):
        # Refresh tokens are single-use: lock the row so concurrent requests
        # (multiple gunicorn workers) don't both spend the same refresh_token.
        # Whoever waits on the lock re-reads the row and finds it already refreshed.
        token = (
            OAuthToken.query.filter_by(user_id=user_id, provider="whoop")
            .populate_existing().with_for_update().first()
        )
        if not token:
            db.session.rollback()
            return None
        if not _token_expiring(token):
            access_token = token.access_token
            db.session.commit()  # release lock
            return access_token
        try:
            resp = requests.post(WHOOP_TOKEN_URL, data={
                "grant_type": "refresh_token",
                "refresh_token": token.refresh_token,
                "client_id": current_app.config["WHOOP_CLIENT_ID"],
                "client_secret": current_app.config["WHOOP_CLIENT_SECRET"],
                # Without scope=offline Whoop returns no new refresh_token; the old one
                # is single-use, so the next refresh would fail.
                "scope": "offline",
            })
            if not resp.ok:
                current_app.logger.error(f"Whoop token refresh failed: {resp.status_code} {resp.text}")
            resp.raise_for_status()
            _save_token(user_id, resp.json())  # commits → releases lock
            token = OAuthToken.query.filter_by(user_id=user_id, provider="whoop").first()
        except Exception as e:
            db.session.rollback()  # release lock
            current_app.logger.error(f"Whoop token refresh failed: {e}")
            return None

    return token.access_token


def _api_get(access_token: str, path: str, params: dict = None) -> dict:
    resp = requests.get(
        f"{WHOOP_API_BASE}{path}",
        headers={"Authorization": f"Bearer {access_token}"},
        params=params or {},
    )
    resp.raise_for_status()
    return resp.json()


def _fetch_all_pages(access_token: str, path: str, params: dict = None) -> list:
    records = []
    p = dict(params or {})
    while True:
        data = _api_get(access_token, path, p)
        records.extend(data.get("records", []))
        next_token = data.get("next_token")
        if not next_token:
            break
        p["nextToken"] = next_token
    return records


def is_connected(user_id: str) -> bool:
    # A stored token whose refresh fails is useless — report it as disconnected
    # so the frontend prompts a reconnect.
    return _get_valid_token(user_id) is not None


def _local_date(dt_utc: datetime, tz_offset_str: str) -> date:
    """Convert a UTC datetime to a local date using a Whoop timezone_offset string like '+02:00'."""
    try:
        sign = 1 if tz_offset_str[0] != "-" else -1
        parts = tz_offset_str.lstrip("+-").split(":")
        delta = timedelta(
            hours=int(parts[0]) * sign,
            minutes=int(parts[1]) * sign if len(parts) > 1 else 0,
        )
        return (dt_utc + delta).date()
    except (IndexError, ValueError):
        return dt_utc.date()


WHOOP_SYNC_LOCK_ID = 7_301_001


def _dedupe_whoop_days(user_id: str):
    """Remove duplicate whoop_data rows per date, keeping the oldest."""
    seen = set()
    for row in WhoopData.query.filter_by(user_id=user_id).order_by(WhoopData.date, WhoopData.created_at).all():
        if row.date in seen:
            db.session.delete(row)
        else:
            seen.add(row.date)
    db.session.flush()


def sync(user_id: str, days: int = 30) -> dict:
    access_token = _get_valid_token(user_id)
    if not access_token:
        return {"status": "error", "message": "Whoop not connected"}

    # Serialize syncs: two concurrent syncs (gunicorn workers, double-fired frontend
    # effects) would each insert the same rows. The lock is released at the final commit.
    db.session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": WHOOP_SYNC_LOCK_ID})
    _dedupe_whoop_days(user_id)

    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00Z")
    end = now.strftime("%Y-%m-%dT23:59:59Z")

    try:
        recovery_records = _fetch_all_pages(access_token, "/recovery", {"start": start, "end": end})
        sleep_records = _fetch_all_pages(access_token, "/activity/sleep", {"start": start, "end": end})
    except requests.HTTPError as e:
        body = e.response.text if e.response is not None else ""
        current_app.logger.error(f"Whoop API error: {e} — {body}")
        return {"status": "error", "message": str(e), "detail": body}

    # Build sleep_id → local_date map first (sleep has timezone_offset, recovery does not)
    sleep_id_to_date: dict[int, date] = {}
    day_map: dict[date, dict] = {}

    for s in sleep_records:
        if s.get("score_state") != "SCORED" or s.get("nap"):
            continue
        score = s.get("score", {})
        try:
            end_dt = datetime.fromisoformat(s["end"].replace("Z", "+00:00"))
            tz_str = s.get("timezone_offset", "+00:00")
            d = _local_date(end_dt, tz_str)
        except (KeyError, ValueError):
            continue

        if s.get("id"):
            sleep_id_to_date[s["id"]] = d

        start_dt = datetime.fromisoformat(s["start"].replace("Z", "+00:00"))
        duration_hours = (end_dt - start_dt).total_seconds() / 3600

        sleep_needed = score.get("sleep_needed", {})
        needed_ms = (
            (sleep_needed.get("baseline_milli") or 0) +
            (sleep_needed.get("need_from_sleep_debt_milli") or 0) +
            (sleep_needed.get("need_from_strain_milli") or 0)
        )
        day_map.setdefault(d, {})
        day_map[d].update({
            "sleep_score": score.get("sleep_performance_percentage"),
            "sleep_duration_hours": round(duration_hours, 2),
            "sleep_needed_hours": round(needed_ms / 3_600_000, 2) if needed_ms else None,
            "sleep_consistency_pct": score.get("sleep_consistency_percentage"),
            "sleep_efficiency_pct": score.get("sleep_efficiency_percentage"),
            "sleep_disturbances": score.get("disturbance_count"),
        })

    # Merge recovery into the same date — use the associated sleep date when available
    for r in recovery_records:
        if r.get("score_state") != "SCORED":
            continue
        score = r.get("score", {})
        # Prefer sleep_id mapping so recovery lands on the same date as sleep
        sleep_id = r.get("sleep_id")
        if sleep_id and sleep_id in sleep_id_to_date:
            d = sleep_id_to_date[sleep_id]
        else:
            try:
                d = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")).date()
            except (KeyError, ValueError):
                continue
        day_map.setdefault(d, {})
        day_map[d].update({
            "recovery_score": score.get("recovery_score"),
            "hrv_ms": score.get("hrv_rmssd_milli"),
            "resting_hr": score.get("resting_heart_rate"),
            "respiratory_rate": score.get("respiratory_rate"),
            "raw": r,
        })

    # Step count lives on the cycle, available since 2026-09-23. The current cycle
    # carries steps-so-far. A cycle starts at sleep onset (often before midnight), so
    # its start date is usually the previous day. Map it through its sleep instead,
    # so steps land on the same date as recovery/sleep.
    cycle_id_to_date: dict[int, date] = {}
    for s in sleep_records:
        if s.get("cycle_id") and s.get("id") in sleep_id_to_date:
            cycle_id_to_date[s["cycle_id"]] = sleep_id_to_date[s["id"]]
    for r in recovery_records:
        if r.get("cycle_id") and r.get("sleep_id") in sleep_id_to_date:
            cycle_id_to_date.setdefault(r["cycle_id"], sleep_id_to_date[r["sleep_id"]])
    try:
        cycle_records = _fetch_all_pages(access_token, "/cycle", {"start": start, "end": end})
        for c in cycle_records:
            steps = c.get("step_count")
            if steps is None:
                steps = (c.get("score") or {}).get("step_count")
            if steps is None:
                continue
            d = cycle_id_to_date.get(c.get("id"))
            if d is None:
                # No scored sleep yet: sleep onset + 12h lands on the wake-up day
                try:
                    start_dt = datetime.fromisoformat(c["start"].replace("Z", "+00:00"))
                    d = _local_date(start_dt + timedelta(hours=12), c.get("timezone_offset", "+00:00"))
                except (KeyError, ValueError):
                    continue
            day_map.setdefault(d, {})["step_count"] = steps
    except Exception as e:
        current_app.logger.warning(f"Whoop cycle/step sync failed: {e}")

    # Upsert into whoop_data
    upserted = 0
    for d, values in day_map.items():
        existing = WhoopData.query.filter_by(user_id=user_id, date=d).first()
        if existing:
            for k, v in values.items():
                if k != "raw" and v is not None:
                    setattr(existing, k, v)
            if "raw" in values:
                existing.raw_json = values["raw"]
        else:
            existing = WhoopData(
                user_id=user_id,
                date=d,
                recovery_score=values.get("recovery_score"),
                hrv_ms=values.get("hrv_ms"),
                resting_hr=values.get("resting_hr"),
                respiratory_rate=values.get("respiratory_rate"),
                sleep_score=values.get("sleep_score"),
                sleep_duration_hours=values.get("sleep_duration_hours"),
                sleep_needed_hours=values.get("sleep_needed_hours"),
                sleep_consistency_pct=values.get("sleep_consistency_pct"),
                sleep_efficiency_pct=values.get("sleep_efficiency_pct"),
                sleep_disturbances=values.get("sleep_disturbances"),
                step_count=values.get("step_count"),
                raw_json=values.get("raw"),
            )
            db.session.add(existing)
        upserted += 1

    # Also sync body weight from Whoop
    weight_synced = 0
    try:
        body = _api_get(access_token, "/body/measurement")
        weight_kg = body.get("weight")
        if weight_kg:
            today = now.date()
            existing_weight = WeightLog.query.filter_by(user_id=user_id, date=today, source="whoop").first()
            if not existing_weight:
                db.session.add(WeightLog(
                    user_id=user_id,
                    date=today,
                    weight_kg=weight_kg,
                    source="whoop",
                ))
                weight_synced = 1
    except Exception:
        pass

    # Sync Whoop workouts
    workouts_synced = 0
    workouts_deleted = 0
    try:
        workout_records = _fetch_all_pages(access_token, "/activity/workout", {"start": start, "end": end})
        existing_whoop_ids = {}
        for w in Workout.query.filter_by(user_id=user_id, source="whoop").order_by(Workout.created_at).all():
            if not w.raw_json:
                continue
            wo_id = w.raw_json.get("id")
            if wo_id in existing_whoop_ids:
                db.session.delete(w)  # duplicate from an earlier concurrent sync
                workouts_deleted += 1
            else:
                existing_whoop_ids[wo_id] = w

        seen_ids = set()
        for wo in workout_records:
            wo_id = wo.get("id")
            if not wo_id:
                continue
            sport_id = wo.get("sport_id", 0)
            sport_name = wo.get("sport_name", "").lower()
            SKIP_SPORT_NAMES = {"activity", "walking", "commuting"}
            if sport_name in SKIP_SPORT_NAMES or sport_id in SKIP_SPORT_IDS:
                seen_ids.add(wo_id)  # still mark as seen so we don't delete it
                continue
            display_name = sport_name.replace("_", " ").title() if sport_name else f"Sport {sport_id}"
            try:
                start_dt = datetime.fromisoformat(wo["start"].replace("Z", "+00:00"))
                end_dt = datetime.fromisoformat(wo["end"].replace("Z", "+00:00"))
                duration = int((end_dt - start_dt).total_seconds() / 60)
                tz_str = wo.get("timezone_offset", "+00:00")
                sign = 1 if tz_str[0] != "-" else -1
                tz_parts = tz_str.lstrip("+-").split(":")
                tz_delta = timedelta(
                    hours=int(tz_parts[0]) * sign,
                    minutes=int(tz_parts[1]) * sign if len(tz_parts) > 1 else 0,
                )
                wo_date = (start_dt + tz_delta).date()
            except (KeyError, ValueError):
                continue

            seen_ids.add(wo_id)
            existing = existing_whoop_ids.get(wo_id)
            if existing:
                existing.title = display_name
                existing.duration_minutes = duration
                existing.raw_json = wo
                existing.date = wo_date
            else:
                db.session.add(Workout(
                    user_id=user_id,
                    date=wo_date,
                    source="whoop",
                    title=display_name,
                    duration_minutes=duration,
                    raw_json=wo,
                ))
            workouts_synced += 1

        # Delete Whoop workouts that no longer exist in Whoop (deleted by user).
        # Only within the fetched window (1 day margin for timezones) — older
        # workouts simply weren't fetched and must be kept.
        window_start = (now - timedelta(days=days - 1)).date()
        for wo_id, w in existing_whoop_ids.items():
            if wo_id not in seen_ids and w.date >= window_start:
                db.session.delete(w)
                workouts_deleted += 1

    except Exception as e:
        current_app.logger.warning(f"Whoop workout sync failed: {e}")

    db.session.commit()
    return {
        "status": "ok",
        "days_synced": upserted,
        "weight_synced": weight_synced,
        "workouts_synced": workouts_synced,
        "workouts_deleted": workouts_deleted,
    }
