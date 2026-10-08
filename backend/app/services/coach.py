"""Training recommendation: goals + 7 days of Whoop recovery + 7 days of workouts → Claude."""
from datetime import date, timedelta

import anthropic
from flask import current_app

from app.models import UserProfile, WhoopData, Workout, WeightLog
from app.services.workout_utils import dedupe_workouts

MODEL = "claude-opus-5-5"
DAYS = 7

SYSTEM_PROMPT = """You are the personal strength & conditioning coach of one person. You get their goals, \
their Whoop recovery data and their training log, and you recommend what they should do today.

How to decide:
- Recovery and HRV/RHR trend set the intensity ceiling for today. A single low day after several good \
days means moderate, not rest; several low days or a falling HRV trend means back off.
- Look at what was trained when: avoid hitting the same muscle groups hard on consecutive days, and \
count cardio load (duration, heart rate) as well as lifting.
- Respect injuries mentioned in the goals: progress conservatively, prefer exercises that load the \
injured area in a controlled way, and say what to stop on (e.g. pain above a 3/10).
- If the goals include losing weight, keep enough volume to retain muscle; don't recommend extra \
cardio as compensation for eating.
- Use only the data given. If something important is missing (no Whoop data today, no logged \
workouts), say so in one line and decide anyway.

Answer in Dutch, in markdown, short enough to read on a phone:
1. One bold line with the verdict for today (for example: **Vandaag: upper body kracht, gemiddelde intensiteit**).
2. The session: concrete exercises or cardio with sets × reps / duration and intensity (RPE or heart-rate zone). \
Max ~8 lines.
3. "Waarom" with 2–3 bullets that point at the specific numbers that drove the decision.
No intro, no closing pleasantries."""


def _fmt(v, unit="", digits=0):
    if v is None:
        return "—"
    return f"{round(v, digits) if digits else round(v)}{unit}"


def _summarize_workout(w: Workout) -> str:
    raw = w.raw_json or {}
    head = f"- {w.date.isoformat()} ({w.date.strftime('%a')}) · {w.source} · {w.title or 'Workout'}"
    if w.duration_minutes:
        head += f" · {w.duration_minutes} min"
    lines = [head]

    if w.source == "hevy":
        for ex in raw.get("exercises", []):
            sets = [s for s in ex.get("sets", []) if s.get("reps") is not None]
            if not sets:
                continue
            top = max(sets, key=lambda s: (s.get("weight_kg") or 0, s.get("reps") or 0))
            top_str = f"{top.get('weight_kg') or 0:g} kg × {top.get('reps')}" if top.get("weight_kg") else f"{top.get('reps')} reps"
            lines.append(f"    {ex.get('title', 'Exercise')}: {len(sets)} sets, top {top_str}")
    elif w.source == "garmin":
        parts = []
        if raw.get("distance"):
            parts.append(f"{raw['distance'] / 1000:.1f} km")
        if raw.get("averageHR"):
            parts.append(f"avg HR {round(raw['averageHR'])}")
        if raw.get("maxHR"):
            parts.append(f"max HR {round(raw['maxHR'])}")
        if raw.get("elevationGain"):
            parts.append(f"{round(raw['elevationGain'])} m up")
        if parts:
            lines.append("    " + ", ".join(parts))
    elif w.source == "whoop":
        score = raw.get("score") or {}
        parts = []
        if score.get("strain") is not None:
            parts.append(f"strain {score['strain']:.1f}")
        if score.get("average_heart_rate"):
            parts.append(f"avg HR {round(score['average_heart_rate'])}")
        if score.get("max_heart_rate"):
            parts.append(f"max HR {round(score['max_heart_rate'])}")
        if parts:
            lines.append("    " + ", ".join(parts))
    return "\n".join(lines)


def build_training_context(user_id: str, target: date) -> str:
    start = target - timedelta(days=DAYS)

    profile = UserProfile.query.filter_by(user_id=user_id).first()
    goals = (profile.goals if profile else None) or "(no goals set)"

    whoop_rows = (
        WhoopData.query.filter_by(user_id=user_id)
        .filter(WhoopData.date > start, WhoopData.date <= target)
        .order_by(WhoopData.date.asc()).all()
    )
    whoop_lines = [
        f"- {r.date.isoformat()} ({r.date.strftime('%a')}): recovery {_fmt(r.recovery_score, '%')}, "
        f"HRV {_fmt(r.hrv_ms, ' ms')}, RHR {_fmt(r.resting_hr, ' bpm')}, "
        f"sleep {_fmt(r.sleep_score, '%')} ({_fmt(r.sleep_duration_hours, ' h', 1)}), "
        f"steps {_fmt(r.step_count)}"
        for r in whoop_rows
    ] or ["(no Whoop data in this period)"]

    workouts = (
        Workout.query.filter_by(user_id=user_id)
        .filter(Workout.date >= start, Workout.date <= target)
        .all()
    )
    workouts = sorted(dedupe_workouts(workouts), key=lambda w: w.date)
    workout_lines = [_summarize_workout(w) for w in workouts] or ["(no workouts logged)"]

    weights = (
        WeightLog.query.filter_by(user_id=user_id)
        .filter(WeightLog.date >= target - timedelta(days=30), WeightLog.date <= target)
        .order_by(WeightLog.date.asc()).all()
    )
    if weights:
        weight_line = f"{weights[-1].weight_kg} kg on {weights[-1].date.isoformat()}"
        if len(weights) > 1:
            weight_line += f" (was {weights[0].weight_kg} kg on {weights[0].date.isoformat()})"
    else:
        weight_line = "(no weight logged in the last 30 days)"

    return f"""Today is {target.strftime('%A')} {target.isoformat()}.

## Goals
{goals}

## Whoop, last {DAYS} days (today last; today's recovery reflects last night)
{chr(10).join(whoop_lines)}

## Workouts, last {DAYS} days (deduplicated across Hevy/Garmin/Whoop; a workout dated today was already done today)
{chr(10).join(workout_lines)}

## Weight
{weight_line}"""


class CoachError(Exception):
    pass


def recommend_training(user_id: str, target: date) -> str:
    context = build_training_context(user_id, target)
    client = anthropic.Anthropic(
        api_key=current_app.config["ANTHROPIC_API_KEY"], timeout=150, max_retries=0,
    )
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=8000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": context + "\n\nWhat should I do today?"}],
            # Claude Opus 5.5: thinking is always on; effort is the depth control.
            # Server-side fallback reroutes the request if the model declines it.
            extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
            extra_body={"output_config": {"effort": "medium"}, "fallbacks": "default"},
        )
    except anthropic.RateLimitError as e:
        raise CoachError("Claude is busy (rate limited), try again in a minute") from e
    except anthropic.APIStatusError as e:
        current_app.logger.error(f"Coach Claude error {e.status_code}: {e.message}")
        raise CoachError("Claude request failed") from e
    except anthropic.APIConnectionError as e:
        raise CoachError("Could not reach Claude") from e

    if response.stop_reason == "refusal":
        raise CoachError("Claude declined to answer")

    text = "\n".join(
        b.text for b in response.content if getattr(b, "type", None) == "text" and getattr(b, "text", "")
    ).strip()
    if not text:
        raise CoachError("Empty answer from Claude")
    return text
