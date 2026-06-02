import json
import re
from datetime import date, timedelta
from flask import current_app
import anthropic

from app import db
from app.models import WhoopData, NutritionLog, WeightLog, Workout, ChatMessage
from app.services.workout_utils import calc_workout_kcal, dedupe_workouts

MODEL = "claude-sonnet-4-6"
MAX_HISTORY_FOOD = 0
MAX_HISTORY_DEFAULT = 8

FOOD_KEYWORDS = {
    "gegeten", "gedronken", "geëten", "ontbijt", "lunch", "diner", "avondeten",
    "breakfast", "dinner", "snack", "ate", "drank", "drink", "eten", "drinken",
    "kcal", "calorie", "macro", "protein", "eiwit", "gram", "portie", "brood",
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

WORKOUT_CONTEXT_KEYWORDS = {
    "workout", "training", "gym", "gesport", "getrained", "krachttraining",
    "push", "pull", "cardio", "fietsen", "hardlopen", "lopen", "zwemmen",
    "sets", "reps", "bench", "squat", "deadlift", "spierpijn", "spier",
    "garmin", "hevy", "oefening",
    "hartslag", "hrv", "slaap", "sleep", "recovery", "whoop", "herstel",
    "week", "maand", "trend", "vorige week", "gemiddeld", "statistiek",
    "progressie", "resultaat", "verbrand", "over tijd",
}


def _is_food_message(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in FOOD_KEYWORDS)


def _is_branded_food(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in BRAND_KEYWORDS)


def _needs_rich_context(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in WORKOUT_CONTEXT_KEYWORDS)


HEIGHT_CM = 192
DATE_OF_BIRTH = date(1999, 10, 3)
AVG_DAILY_STEPS = 10000


def calculate_tdee(user_id: str, today: date) -> str:
    latest_weight = (
        WeightLog.query.filter_by(user_id=user_id)
        .order_by(WeightLog.date.desc()).first()
    )
    weight_kg = latest_weight.weight_kg if latest_weight else 88

    age = (today - DATE_OF_BIRTH).days / 365.25
    bmr = 10 * weight_kg + 6.25 * HEIGHT_CM - 5 * age + 5  # Mifflin-St Jeor male
    step_kcal = AVG_DAILY_STEPS * 0.04 * (weight_kg / 70)
    tef = bmr * 0.10

    todays_workouts = Workout.query.filter_by(user_id=user_id, date=today).all()
    workout_kcal, workout_notes = calc_workout_kcal(todays_workouts, weight_kg)

    tdee = round(bmr + step_kcal + tef + workout_kcal)
    breakdown = f"BMR {round(bmr)} + steps {round(step_kcal)} + TEF {round(tef)}"
    if workout_notes:
        breakdown += " + " + " + ".join(workout_notes)

    return f"~{tdee} kcal ({breakdown})"


def build_context(user_id: str, user_message: str = "", target_date: date = None) -> str:
    today = target_date or date.today()
    rich = _needs_rich_context(user_message)

    # Latest weight (always)
    latest_weight = (
        WeightLog.query.filter_by(user_id=user_id)
        .order_by(WeightLog.date.desc()).first()
    )
    weight_str = f"{latest_weight.weight_kg}kg ({latest_weight.date})" if latest_weight else "No data"

    # Weight trend — only when asking about workouts/trends
    if rich:
        week_ago = today - timedelta(days=7)
        weights = (
            WeightLog.query
            .filter(WeightLog.user_id == user_id, WeightLog.date >= week_ago)
            .order_by(WeightLog.date)
            .all()
        )
        weight_str = " → ".join(f"{w.weight_kg}kg" for w in weights) if weights else weight_str

    # Today's Whoop data (always, it's small)
    whoop = WhoopData.query.filter_by(user_id=user_id, date=today).first()
    whoop_str = "No data"
    if whoop:
        whoop_str = (
            f"Recovery: {whoop.recovery_score}, HRV: {whoop.hrv_ms}ms, "
            f"Resting HR: {whoop.resting_hr}bpm, Sleep: {whoop.sleep_duration_hours}h"
        )

    # Today's nutrition — show individual items so Claude knows exactly what's already logged
    nutrition = NutritionLog.query.filter_by(user_id=user_id, date=today).all()
    if nutrition:
        total_cal = sum(n.calories or 0 for n in nutrition)
        total_protein = sum(n.protein_g or 0 for n in nutrition)
        total_carbs = sum(n.carbs_g or 0 for n in nutrition)
        total_fat = sum(n.fat_g or 0 for n in nutrition)
        items = ", ".join(f"{n.description} ({round(n.calories or 0)} kcal)" for n in nutrition)
        nutrition_str = (
            f"{round(total_cal)} kcal | P {round(total_protein)}g C {round(total_carbs)}g F {round(total_fat)}g\n"
            f"Logged: {items}"
        )
    else:
        nutrition_str = "Nothing logged yet"

    tdee_str = calculate_tdee(user_id, today)
    tdee_line = f"Estimated TDEE today: {tdee_str}"

    context = f"""Today: {today}
Latest weight: {weight_str}
Today's Whoop: {whoop_str}
Today's nutrition so far: {nutrition_str}
{tdee_line}"""

    # Nutrition history (last 7 days) — only when rich context needed
    if rich:
        nutrition_history_lines = []
        for i in range(6, 0, -1):
            d = today - timedelta(days=i)
            logs = NutritionLog.query.filter_by(user_id=user_id, date=d).all()
            if logs:
                kcal = round(sum(n.calories or 0 for n in logs))
                p    = round(sum(n.protein_g or 0 for n in logs))
                c    = round(sum(n.carbs_g or 0 for n in logs))
                f    = round(sum(n.fat_g or 0 for n in logs))
                nutrition_history_lines.append(f"{d}: {kcal} kcal | P {p}g C {c}g F {f}g")
        if nutrition_history_lines:
            context += "\nNutrition last 7 days:\n" + "\n".join(nutrition_history_lines)

    # Workout details — only when relevant
    if rich:
        raw_workouts = (
            Workout.query
            .filter_by(user_id=user_id)
            .order_by(Workout.date.desc())
            .limit(20)
            .all()
        )
        workouts = dedupe_workouts(raw_workouts)
        workout_lines = []
        for w in workouts:
            raw = w.raw_json or {}
            exercises = raw.get("exercises", [])
            ex_summary = []
            for ex in exercises[:6]:
                sets = ex.get("sets", [])
                if sets:
                    top_set = max(sets, key=lambda s: (s.get("weight_kg") or 0))
                    ex_summary.append(
                        f"{ex.get('title', '?')} {top_set.get('reps')}x{top_set.get('weight_kg')}kg"
                    )
            detail = ", ".join(ex_summary) if ex_summary else "no detail"
            dur = f"{w.duration_minutes}min " if w.duration_minutes else ""
            workout_lines.append(f"{w.date} {w.title} ({dur}{detail})")
        workout_str = "\n".join(workout_lines) if workout_lines else "No recent workouts"
        context += f"\nRecent workouts:\n{workout_str}"

    return context


WEB_SEARCH_TOOL = {"type": "web_search_20250305", "name": "web_search"}


def _get_history(user_id: str, limit: int, target_date: date = None) -> list[dict]:
    d = target_date or date.today()
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
    history_limit = MAX_HISTORY_FOOD if is_food else MAX_HISTORY_DEFAULT

    system_prompt = f"""You are a personal health coach with access to the user's health data. Today's snapshot:

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
- If food was not eaten (e.g. "I'm planning to eat..."), do NOT log it.
- Only log when the user explicitly says they ate/drank something.
Respond in the same language the user writes in. Be concise and data-driven."""

    history = _get_history(user_id, history_limit, target_date)
    messages = history + [{"role": "user", "content": user_message}]

    while True:
        response = client.messages.create(
            model=MODEL,
            max_tokens=2048 if is_food else 1024,
            system=system_prompt,
            tools=tools,
            messages=messages,
        )

        text_blocks = [b for b in response.content if hasattr(b, "text") and b.text]

        if response.stop_reason == "end_turn":
            return "\n".join(b.text for b in text_blocks) if text_blocks else ""

        if response.stop_reason == "tool_use":
            # Continue loop — web_search is server-side, pass back tool results
            messages.append({"role": "assistant", "content": response.content})
            tool_results = [
                {"type": "tool_result", "tool_use_id": b.id, "content": ""}
                for b in response.content if hasattr(b, "id") and b.type == "tool_use"
            ]
            if tool_results:
                messages.append({"role": "user", "content": tool_results})
        else:
            return "\n".join(b.text for b in text_blocks) if text_blocks else ""


def log_food_quick(description: str, meal_type_hint: str, target_date_str: str, user_id: str) -> list:
    """Lightweight food logging — no history, no health context, just food extraction."""
    client = anthropic.Anthropic(api_key=current_app.config["ANTHROPIC_API_KEY"])
    tools = [WEB_SEARCH_TOOL] if _is_branded_food(description) else []
    meal_hint = f"The meal type is {meal_type_hint}. " if meal_type_hint else ""

    system = f"""{meal_hint}Extract all food items and output ONLY a JSON array:
```json
[{{"log_nutrition": true, "meal_type": "lunch", "description": "100g havermout", "calories": 362, "protein_g": 12.0, "carbs_g": 58.0, "fat_g": 7.0}}]
```
Rules: one entry per food item, NEVO nutritional values, calories ≈ protein*4 + carbs*4 + fat*9, use web search for branded products, output ONLY the JSON array."""

    messages = [{"role": "user", "content": description}]
    text = ""
    while True:
        response = client.messages.create(
            model=MODEL, max_tokens=1024, system=system, tools=tools, messages=messages,
        )
        text_blocks = [b for b in response.content if hasattr(b, "text") and b.text]
        if response.stop_reason == "end_turn":
            text = "\n".join(b.text for b in text_blocks)
            break
        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            tool_results = [{"type": "tool_result", "tool_use_id": b.id, "content": ""}
                            for b in response.content if hasattr(b, "id") and b.type == "tool_use"]
            if tool_results:
                messages.append({"role": "user", "content": tool_results})
        else:
            text = "\n".join(b.text for b in text_blocks)
            break

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
            date=target_date or date.today(),
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
