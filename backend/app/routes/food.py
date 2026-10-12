import requests
from flask import Blueprint, request, jsonify, current_app

food_bp = Blueprint("food", __name__)

USDA_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"
# The legacy cgi/search.pl endpoint returns 503s; search-a-licious is the current search API
OFF_URL = "https://search.openfoodfacts.org/search"

NUTRIENT_IDS = {
    "calories": 1008,
    "protein": 1003,
    "carbs": 1005,
    "fat": 1004,
}


def _get_nutrient(nutrients, nutrient_id):
    for n in nutrients:
        if n.get("nutrientId") == nutrient_id:
            return round(n.get("value") or 0, 2)
    return 0


def _search_usda(query, api_key):
    try:
        resp = requests.get(
            USDA_URL,
            params={
                "query": query,
                "api_key": api_key,
                "pageSize": 15,
                "dataType": "Branded,Foundation,SR Legacy",
            },
            timeout=4,  # DEMO_KEY is slow/rate-limited; don't let it hold up the search
        )
        resp.raise_for_status()
        foods = resp.json().get("foods", [])
    except Exception as e:
        current_app.logger.error(f"USDA error: {e}")
        return []

    results = []
    for f in foods:
        nutrients = f.get("foodNutrients", [])
        kcal = _get_nutrient(nutrients, NUTRIENT_IDS["calories"])
        if not kcal:
            continue
        results.append({
            "name": f.get("description", ""),
            "brand": f.get("brandOwner", "") or f.get("brandName", ""),
            "calories_100g": kcal,
            "protein_100g": _get_nutrient(nutrients, NUTRIENT_IDS["protein"]),
            "carbs_100g": _get_nutrient(nutrients, NUTRIENT_IDS["carbs"]),
            "fat_100g": _get_nutrient(nutrients, NUTRIENT_IDS["fat"]),
        })
    return results


def _first_brand(brands) -> str:
    # search-a-licious returns a list; the legacy API returned a comma-separated string
    if isinstance(brands, list):
        return brands[0] if brands else ""
    return (brands or "").split(",")[0].strip()


def _search_off(query):
    try:
        resp = requests.get(
            OFF_URL,
            params={
                "q": query,
                "page_size": 15,
                "langs": "nl,en",
                "fields": "product_name,brands,nutriments",
            },
            timeout=5,
        )
        resp.raise_for_status()
        products = resp.json().get("hits", [])
    except Exception as e:
        current_app.logger.error(f"OFF error: {e}")
        return []

    results = []
    for p in products:
        n = p.get("nutriments", {})
        kcal = n.get("energy-kcal_100g")
        if not p.get("product_name") or not kcal:
            continue
        results.append({
            "name": p["product_name"],
            "brand": _first_brand(p.get("brands")),
            "calories_100g": round(kcal, 1),
            "protein_100g": round(n.get("proteins_100g") or 0, 2),
            "carbs_100g": round(n.get("carbohydrates_100g") or 0, 2),
            "fat_100g": round(n.get("fat_100g") or 0, 2),
        })
    return results


@food_bp.route("/food/search")
def food_search():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify([])

    api_key = current_app.config.get("USDA_API_KEY", "DEMO_KEY")

    # Both sources in parallel (USDA with the DEMO_KEY alone takes ~6 s). Threads need
    # the app context because the search helpers log via current_app.
    from concurrent.futures import ThreadPoolExecutor
    app = current_app._get_current_object()

    def in_app(fn, *args):
        with app.app_context():
            return fn(*args)

    with ThreadPoolExecutor(max_workers=2) as pool:
        usda_future = pool.submit(in_app, _search_usda, query, api_key)
        off_future = pool.submit(in_app, _search_off, query)
        usda, off = usda_future.result(), off_future.result()

    # OpenFoodFacts first (Dutch products, fast); USDA fills up generic foods
    results, seen = [], set()
    for r in off + usda:
        key = (r["name"].lower(), (r["brand"] or "").lower())
        if key not in seen:
            seen.add(key)
            results.append(r)

    return jsonify(results[:20])
