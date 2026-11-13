import json
import re
from datetime import date, timedelta
from flask import current_app
import anthropic

from app import db
from app.models import WhoopData, NutritionLog, WeightLog, Workout, ChatMessage
from app.services.workout_utils import dedupe_workouts
from app.services.energy import local_today

MODEL = "claude-sonnet-5-5"
# Today's conversation, so follow-ups ("and Tuesday?") know what was said
MAX_HISTORY = 12

# Messages that log food (quick, low effort). Not "kcal"/"eiwit"/"macro": those are just as
# often analysis questions, which get more thinking.
FOOD_KEYWORDS = {
    "gegeten", "gedronken", "geëten", "ontbijt", "lunch", "diner", "avondeten",
    "breakfast", "dinner", "snack", "ate", "drank", "drink", "eten", "drinken",
    "gram", "portie", "brood",
    "melk", "vlees", "kip", "vis", "rijst", "pasta", "groente", "fruit", "kaas",
    "ei", "eieren", "yoghurt", "shake", "supplement", "whey", "creatine",
}

BRAND_KEYWORDS = {
    "myprotein", "optimum nutrition", "bulk powders", "body & fit", "bodyfit",
    "alpro", "oatly", "the protein works",
    "albert heijn", " ah ", "lidl", "jumbo", "dirk", "aldi", "plus supermarkt",
    "mcdonalds", "mcdonald's", "kfc", "burger king", "subway", "dominos", "domino's",
    "starbucks", "dunkin",
}

def _has_keyword(text: str, keywords: set) -> bool:
    # Whole words only: a substring test made "ei" match "eiwit", "zei", ... and "kcal"
    # turned every energy question into a food message (which used to drop the chat history)
    lower = text.lower()
    return any(re.search(rf"(?<!\w){re.escape(kw.strip())}(?!\w)", lower) for kw in keywords)


def _is_food_message(text: str) -> bool:
    return _has_keyword(text, FOOD_KEYWORDS)


def _is_branded_food(text: str) -> bool:
    return _has_keyword(text, BRAND_KEYWORDS)


def calculate_tdee(user_id: str, today: date) -> str:
    from app.services.energy import energy_for
    latest_weight = (
        WeightLog.query.filter_by(user_id=user_id)
        .order_by(WeightLog.date.desc()).first()
    )
    weight_kg = latest_weight.weight_kg if latest_weight else 88

    e = energy_for(user_id, today, weight_kg)
    steps_label = f"{e['steps']} steps" if e["steps_source"] == "whoop" else f"~{e['steps']} steps (estimate)"
    if e["workout_steps"]:
        steps_label += f", minus {e['workout_steps']} workout steps"
    breakdown = f"BMR {e['bmr']} + {steps_label} ({e['step_kcal']} kcal so far) + TEF {e['tef']}"
    if e["workout_notes"]:
        breakdown += " + " + " + ".join(e["workout_notes"])

    return f"~{e['tdee']} kcal full-day estimate, ~{e['burned_now']} kcal burned so far ({breakdown})"


CONTEXT_DAYS = 28


def _workout_line(w) -> str:
    raw = w.raw_json or {}
    parts = []
    for ex in raw.get("exercises", [])[:8]:
        sets = ex.get("sets", [])
        if sets:
            top = max(sets, key=lambda st: (st.get("weight_kg") or 0))
            parts.append(f"{ex.get('title', '?')} {len(sets)} sets, top {top.get('reps')}x{top.get('weight_kg')}kg")
    if w.source == "garmin":
        if raw.get("distance"):
            parts.append(f"{raw['distance'] / 1000:.1f} km")
        if raw.get("averageHR"):
            parts.append(f"avg HR {round(raw['averageHR'])}")
    elif w.source == "whoop":
        score = raw.get("score") or {}
        if score.get("strain"):
            parts.append(f"strain {round(score['strain'], 1)}")
        if score.get("average_heart_rate"):
            parts.append(f"avg HR {score['average_heart_rate']}")
    dur = f", {w.duration_minutes} min" if w.duration_minutes else ""
    detail = ": " + ", ".join(parts) if parts else ""
    return f"{w.date} {w.title} ({w.source}{dur}){detail}"


def build_context(user_id: str, user_message: str = "", target_date: date = None) -> str:
    """Everything the coach needs, every time: a per-day table for the last 4 weeks (burn
    with its breakdown, intake, logging status, recovery, sleep, weight), the weight trend,
    workouts with detail and today's items. Used to be cut down by keywords in the message,
    which left follow-up questions ("and Tuesday?") without the data to answer them."""
    from collections import defaultdict
    from app.routes.profile import _calorie_days, _intake_estimate

    today = target_date or local_today()
    start = today - timedelta(days=CONTEXT_DAYS)

    # Per-day energy and intake, as the app shows it (Calories screen)
    days = {r["date"]: r for r in _calorie_days((local_today() - start).days)}
    whoop = {w.date: w for w in WhoopData.query.filter(
        WhoopData.user_id == user_id, WhoopData.date > start, WhoopData.date <= today)}
    weights = {}
    for w in WeightLog.query.filter(
            WeightLog.user_id == user_id, WeightLog.date > start - timedelta(days=152),
            WeightLog.date <= today).order_by(WeightLog.date, WeightLog.created_at):
        weights[w.date] = w.weight_kg
    macros = defaultdict(lambda: [0.0, 0.0, 0.0])
    for n in NutritionLog.query.filter(
            NutritionLog.user_id == user_id, NutritionLog.date > start, NutritionLog.date <= today):
        m = macros[n.date]
        m[0] += n.protein_g or 0
        m[1] += n.carbs_g or 0
        m[2] += n.fat_g or 0

    lines = []
    d = start + timedelta(days=1)
    while d <= today:
        r = days.get(d.isoformat())
        cols = [f"{d} {d.strftime('%a')}"]
        if r:
            b = r.get("breakdown") or {}
            parts = [f"BMR {b.get('bmr')}", f"TEF {b.get('tef')}",
                     f"steps {b.get('steps')} = {b.get('step_kcal')}"]
            parts += [f"{w['title']} {w['kcal']}" for w in b.get("workouts", [])]
            if b.get("adaptive"):
                parts.append(f"weight-trend correction {b['adaptive']}")
            cols.append(f"burned {r['burned']} ({', '.join(parts)})")
            if r["consumed"]:
                p, c, f = (round(x) for x in macros[d])
                status = "fully logged" if r["complete"] else "NOT fully logged"
                cols.append(f"ate {r['consumed']} (P {p} C {c} F {f}, {status})")
            else:
                cols.append("ate: nothing logged")
            if r["balance"] is not None:
                cols.append(f"balance {r['balance']:+d}")
        wd = whoop.get(d)
        if wd:
            cols.append(
                f"recovery {wd.recovery_score}, HRV {wd.hrv_ms}, RHR {wd.resting_hr}, "
                f"sleep {wd.sleep_duration_hours}h of {wd.sleep_needed_hours}h needed"
            )
        if d in weights:
            cols.append(f"weight {weights[d]}kg")
        lines.append(" | ".join(cols))
        d += timedelta(days=1)

    # Weight trend: least-squares slope over 4 weeks, monthly averages over ~6 months
    recent = [(k, v) for k, v in weights.items() if k > start]
    weight_lines = []
    if len(recent) >= 2:
        xs = [(k - start).days for k, _ in recent]
        ys = [v for _, v in recent]
        mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
        var = sum((x - mx) ** 2 for x in xs)
        slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / var if var else 0
        weight_lines.append(
            f"4-week trend {slope * 7:+.2f} kg/week ({len(recent)} weigh-ins, "
            f"min {min(ys)}, max {max(ys)}, latest {ys[-1]}kg)"
        )
    by_month = defaultdict(list)
    for k, v in weights.items():
        by_month[k.strftime("%b %Y")].append(v)
    if by_month:
        weight_lines.append("Monthly averages: " + ", ".join(
            f"{k} {sum(v) / len(v):.1f}kg" for k, v in by_month.items()))

    est = _intake_estimate()
    if est.get("ready") and est.get("avg_intake_unlogged_days") is not None:
        weight_lines.append(
            f"Intake implied by the weight trend (last {est['days']} days, unscaled burn): "
            f"~{est['avg_intake_estimated']} kcal/day overall; logged days {est['avg_intake_logged_days']}, "
            f"so the {est['unlogged_days']} unlogged days averaged ~{est['avg_intake_unlogged_days']} (rough)"
        )

    workouts = dedupe_workouts(
        Workout.query.filter(Workout.user_id == user_id, Workout.date > start,
                             Workout.date <= today, Workout.hidden.isnot(True))
        .order_by(Workout.date).all()
    )

    nutrition = NutritionLog.query.filter_by(user_id=user_id, date=today).all()
    items = ", ".join(f"{n.meal_type}: {n.description} ({round(n.calories or 0)} kcal)" for n in nutrition)
    nl = chr(10)

    return f"""Today: {today} ({today.strftime("%A")})
Today's energy: {calculate_tdee(user_id, today)}
Today's logged food: {items or "nothing yet"}

Per day, last {CONTEXT_DAYS} days (burned = the app's estimate incl. steps and workouts; balance only for fully logged days):
{nl.join(lines)}

Weight:
{nl.join(weight_lines) or "No weigh-ins"}

Workouts, last {CONTEXT_DAYS} days:
{nl.join(_workout_line(w) for w in workouts) or "None"}"""


WEB_SEARCH_TOOL = {"type": "web_search_20260209", "name": "web_search"}
MAX_CONTINUATIONS = 5


def _create_until_done(client, messages: list, effort: str = "low", **kwargs) -> str:
    """Run a request to completion and return its text. Web search is a server tool: a long
    search can pause the turn (pause_turn), and sending it back lets the server continue."""
    texts = []
    for _ in range(MAX_CONTINUATIONS):
        response = client.messages.create(
            model=MODEL,
            messages=messages,
            # Low effort keeps food logging quick (Sonnet 5.5 thinks by default); analysis gets more
            output_config={"effort": effort},
            # Server-side fallback reroutes the request if the model declines it
            extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
            extra_body={"fallbacks": "default"},
            **kwargs,
        )
        texts += [b.text for b in response.content if b.type == "text" and b.text]
        if response.stop_reason != "pause_turn":
            break
        messages = messages + [{"role": "assistant", "content": response.content}]
    if response.stop_reason == "refusal":
        current_app.logger.warning(f"Claude declined: {response.stop_details}")
    return "\n".join(texts)


def _get_history(user_id: str, limit: int, target_date: date = None) -> list[dict]:
    d = target_date or local_today()
    messages = (
        ChatMessage.query
        .filter_by(user_id=user_id, date=d)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    messages.reverse()
    return [{"role": m.role, "content": m.content} for m in messages]


def call_claude(user_id: str, user_message: str, context: str, target_date: date = None) -> str:
    client = anthropic.Anthropic(api_key=current_app.config["ANTHROPIC_API_KEY"])
    is_food = _is_food_message(user_message)
    tools = [WEB_SEARCH_TOOL] if _is_branded_food(user_message) else []

    system_prompt = f"""You are a personal health coach with access to the user's health data below. It is
everything the app knows; use it instead of asking the user for numbers it already contains, and
use the per-day "burned" values as given (don't recompute them from BMR). If something isn't in
the data, say so plainly.

{context}

When the user mentions food they ate, output the JSON array FIRST (before your text reply):
```json
[
  {{"log_nutrition": true, "meal_type": "lunch", "description": "1 sneetje bruinbrood", "calories": 80, "protein_g": 3.0, "carbs_g": 14.0, "fat_g": 1.0}},
  {{"log_nutrition": true, "meal_type": "lunch", "description": "3 volkoren knäckebröd", "calories": 174, "protein_g": 4.5, "carbs_g": 33.0, "fat_g": 1.5}}
]
```
Then write your reply after the JSON block.
Nutrition logging rules (follow strictly):
- One JSON entry per individual food item or drink — never combine multiple foods into one entry.
- Use correct meal_type: breakfast / lunch / dinner / snack.
- Use realistic Dutch/European nutritional values (NEVO database standards).
- For packaged products: use web search to find the exact nutritional values, then log based on the quantity eaten.
- Calories must match: roughly 4 kcal/g protein, 4 kcal/g carbs, 9 kcal/g fat.
- If the user corrects a previous log, only log the correction — never re-log already saved items.
- Only log food mentioned in the user's latest message; earlier messages are already logged.
- If food was not eaten (e.g. "I'm planning to eat..."), do NOT log it.
- Only log when the user explicitly says they ate/drank something.
Respond in the same language the user writes in. Be concise and data-driven."""

    history = _get_history(user_id, MAX_HISTORY, target_date)
    # The route saves the new message before calling: don't send it twice
    if history and history[-1] == {"role": "user", "content": user_message}:
        history.pop()
    # The conversation has to open with a user turn
    while history and history[0]["role"] != "user":
        history.pop(0)
    messages = history + [{"role": "user", "content": user_message}]

    return _create_until_done(
        client, messages,
        effort="low" if is_food else "medium",
        max_tokens=8000,  # thinking counts toward max_tokens
        system=system_prompt,
        tools=tools,
    )


def _image_block(data_url: str) -> dict:
    """'data:image/jpeg;base64,...' (as the app sends it) → an image content block."""
    header, _, b64 = data_url.partition(",")
    media_type = header[5:].split(";")[0] if header.startswith("data:") and b64 else "image/jpeg"
    return {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64 or data_url}}


def log_food_quick(description: str, meal_type_hint: str, target_date_str: str, user_id: str,
                   image: str | None = None) -> list:
    """Lightweight food logging — no history, no health context, just food extraction.
    With a photo, the foods and portions come from the image; amounts in the text win."""
    client = anthropic.Anthropic(api_key=current_app.config["ANTHROPIC_API_KEY"])
    tools = [WEB_SEARCH_TOOL] if _is_branded_food(description) else []
    meal_hint = f"The meal type is {meal_type_hint}. " if meal_type_hint else ""

    system = f"""{meal_hint}Extract all food items and output ONLY a JSON array:
```json
[{{"log_nutrition": true, "meal_type": "lunch", "description": "100g havermout", "calories": 362, "protein_g": 12.0, "carbs_g": 58.0, "fat_g": 7.0}}]
```
Rules: one entry per food item, NEVO nutritional values, calories ≈ protein*4 + carbs*4 + fat*9, use web search for branded products, output ONLY the JSON array."""
    if image:
        system += """
A photo of the meal is attached. Identify every food on it and estimate each portion in grams from what you see (plate size, typical portions). Amounts or foods stated in the text are facts: use them as given and only estimate the rest from the photo. Put the gram amount in each description."""

    text_part = description or "Log what's on this photo."
    content = [_image_block(image), {"type": "text", "text": text_part}] if image else description
    messages = [{"role": "user", "content": content}]
    text = _create_until_done(client, messages, max_tokens=4000, system=system, tools=tools)

    code_match = re.search(r'```(?:json)?\s*(\[.*?\])\s*```', text, re.DOTALL)
    bare_match = re.search(r'\[.*?\]', text, re.DOTALL)
    raw = code_match.group(1) if code_match else (bare_match.group() if bare_match else None)
    if not raw:
        return []
    try:
        entries = json.loads(raw)
    except Exception:
        return []

    target_date = date.fromisoformat(target_date_str) if isinstance(target_date_str, str) else target_date_str
    saved = []
    for item in (entries if isinstance(entries, list) else [entries]):
        if not item.get("log_nutrition"):
            continue
        log = NutritionLog(
            user_id=user_id,
            date=target_date,
            meal_type=item.get("meal_type", meal_type_hint),
            description=item.get("description", ""),
            calories=item.get("calories"),
            protein_g=item.get("protein_g"),
            carbs_g=item.get("carbs_g"),
            fat_g=item.get("fat_g"),
        )
        db.session.add(log)
        saved.append(log)
    if saved:
        db.session.commit()
    return saved


def extract_nutrition(user_id: str, assistant_reply: str, target_date: date = None) -> bool:
    """Parse nutrition JSON array (or single object) from Claude's reply and persist."""
    # Match array or single object inside a code block, or bare
    code_block = re.search(r'```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```', assistant_reply, re.DOTALL)
    bare_arr = re.search(r'\[\s*\{[^[\]]*"log_nutrition"[^[\]]*\}\s*(?:,\s*\{[^[\]]*\}\s*)*\]', assistant_reply, re.DOTALL)
    bare_obj = re.search(r'\{[^{}]*"log_nutrition"\s*:\s*true[^{}]*\}', assistant_reply, re.DOTALL)

    raw = None
    if code_block:
        raw = code_block.group(1)
    elif bare_arr:
        raw = bare_arr.group()
    elif bare_obj:
        raw = bare_obj.group()

    if not raw:
        return False

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return False

    entries = data if isinstance(data, list) else [data]
    saved = 0
    for item in entries:
        if not item.get("log_nutrition"):
            continue
        log = NutritionLog(
            user_id=user_id,
            date=target_date or local_today(),
            meal_type=item.get("meal_type"),
            description=item.get("description", ""),
            calories=item.get("calories"),
            protein_g=item.get("protein_g"),
            carbs_g=item.get("carbs_g"),
            fat_g=item.get("fat_g"),
        )
        db.session.add(log)
        saved += 1

    if saved:
        db.session.commit()
    return saved > 0
