# Danesh Health — Project Documentation

## Wat is dit?
Personal health dashboard (PWA) dat data uit Whoop, Garmin en Hevy samenvoegt met AI-powered voedingslogging via Claude. Alleen voor eigen gebruik: geïnstalleerd op iPhone via Safari → "Zet op beginscherm". Een native iOS app (Expo) is gestopt op 2026-10-08 — staat nog in git history (`ios/`, laatste versie in commit `588fc15`).

## Repo structuur
```
danesh-health/
  backend/        Flask REST API (Python) → Azure Container Apps
  frontend/       React + Vite + Tailwind PWA → Azure Static Web Apps
  CLAUDE.md       Dit bestand
```

Deploy: push naar `master` → GitHub Actions (`deploy-backend.yml` / `deploy-frontend.yml`). Backend draait `flask db upgrade` bij container start, dus migraties gaan automatisch mee.

---

## Backend (Flask)

**URL productie:** zie Dev setup
**URL lokaal:** `http://localhost:8000`

### Alle API endpoints

#### Weight
| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | `/api/weight?days={n}` | — | `[{id, date, weight_kg, source, photo_data, created_at}]` |
| POST | `/api/weight` | `{weight_kg, date?, photo_data?}` | created entry |
| PUT | `/api/weight/{id}` | `{weight_kg?, date?, photo_data?}` | updated entry |
| DELETE | `/api/weight/{id}` | — | 204 |

#### Nutrition
| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | `/api/nutrition?date={YYYY-MM-DD}` | — | `[{id, date, meal_type, description, calories, protein_g, carbs_g, fat_g}]` |
| POST | `/api/nutrition` | `{date, meal_type, description, calories, protein_g, carbs_g, fat_g}` | created entry |
| DELETE | `/api/nutrition/{id}` | — | `{deleted: id}` |

#### Workouts
| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | `/api/workouts?limit={n}` | — | `[{id, date, source, title, duration_minutes, exercises, raw_json}]` |
| GET | `/api/workouts/{id}/route` | — | `{points: [[lat,lon]], metrics: [{t, hr, kmh}]}` |

#### Sync
| Method | Path | Response |
|--------|------|----------|
| POST | `/api/sync/whoop` | status |
| POST | `/api/sync/garmin` | status |
| POST | `/api/sync/hevy` | status |

#### Whoop
| Method | Path | Response |
|--------|------|----------|
| GET | `/api/whoop/status` | `{connected: bool}` |
| GET | `/api/whoop/authorize` | redirect naar Whoop OAuth |
| GET | `/api/whoop/today?date={date}` | `{recovery_score, sleep_score, hrv_ms, resting_hr, respiratory_rate, sleep_duration_hours, sleep_needed_hours, sleep_consistency_pct, sleep_efficiency_pct, sleep_disturbances}` |
| GET | `/api/whoop/history?days={n}` | array van Whoop data objecten |
| POST | `/api/whoop/disconnect` | `{status: "ok"}` |

#### Dashboard / TDEE
| Method | Path | Response |
|--------|------|----------|
| GET | `/api/tdee/today?date={date}` | `{tdee, burned_now, bmr, step_kcal, workout_kcal, consumed, balance, weight_kg}` |
| GET | `/api/calories/history?days={n}` | `[{date, burned, consumed, balance}]` |

#### Chat
| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/chat` | `{message, date}` | `{message, nutrition_logged}` |
| GET | `/api/chat/history?date={date}` | — | `[{id, role, content, date, created_at}]` |

#### Food
| Method | Path | Response |
|--------|------|----------|
| GET | `/api/food/search?q={query}` | `[{name, brand, calories_100g, protein_g, carbs_g, fat_g}]` |

#### Profile
| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/profile` | — | `{height_cm, date_of_birth, gender, avg_daily_steps}` |
| PUT | `/api/profile` | `{height_cm?, date_of_birth?, gender?, avg_daily_steps?}` | updated profile |

### Data modellen
```
WeightLog:    { id, date, weight_kg, source, photo_data (base64 JPEG) }
NutritionLog: { id, date, meal_type, description, calories, protein_g, carbs_g, fat_g }
WhoopData:    { id, date, recovery_score (0-100), sleep_score (0-100), hrv_ms, resting_hr,
                respiratory_rate, sleep_duration_hours, sleep_needed_hours,
                sleep_consistency_pct, sleep_efficiency_pct, sleep_disturbances }
Workout:      { id, date, source (hevy/garmin/whoop), title, duration_minutes, raw_json }
  raw_json Hevy:   { exercises: [{title, sets: [{weight_kg, reps, rpe, type}]}] }
  raw_json Garmin: { distance, averageSpeed, elevationGain, calories, averageHR, maxHR,
                     hrTimeInZone_1-5, geoPolylineDTO: {polyline: [{lat,lon,time,speed,heartRate}]} }
ChatMessage:  { id, role (user/assistant), content, date }
UserProfile:  { height_cm, date_of_birth, gender, avg_daily_steps }
```

### Bekende limitaties backend
- **Hardcoded user ID**: `"00000000-0000-0000-0000-000000000001"` — single-user setup
- **Hardcoded profiel**: height=192cm, DOB=1999-10-03, steps=10000 (in claude.py en profile.py)
- **Garmin scraping**: gebruikt onofficiële garminconnect library, kan breken

---

## Frontend (PWA)

Componenten in `frontend/src/components/`: Dashboard, NutritionLog, WorkoutLog, Chat, WeightHistory, WhoopHistory, CaloriesHistory.

- **Dashboard**: datum nav + kalender, Recovery / Sleep / Steps ringen naast elkaar, calorie kaarten (Burned/Consumed/Balance), mini weight chart, Whoop sync/connect.
- **Whoop ring kleuren**: recovery ≥67 groen, ≥34 geel, anders rood. Sleep ≥85 groen, ≥70 blauw, anders rood. Steps ≥10k groen.
- **Getalvelden**: altijd `type="text" inputMode="decimal"` + `toDecimal()` uit `utils/decimal.js`. `type="number"` slikt "86,3" op een NL iPhone.
- **Inputs**: `text-base` (16px) anders zoomt iOS in; `autoComplete="off"`.

## Dev setup
- **Werklaptop**: netwerk blokkeert poort 5432 naar Azure Postgres → lokale backend kan niet. Draai alleen de frontend lokaal tegen de productie-backend: `cd frontend && npm run dev` (vereist `frontend/.env.local` met `VITE_API_BASE_URL=<backend-url>`). Backend-wijzigingen testen = pushen.
- **Backend lokaal** (thuis): `cd backend && .\venv\Scripts\flask --app wsgi run --port 8000 --debug`. Let op: `backend/.env` wijst naar de **productie**-database.
- Backend URL: `https://danesh-health-backend.agreeableground-243793ea.northeurope.azurecontainerapps.io`
- Geen `gh` CLI op de werklaptop; deploy status checken door een live endpoint te pollen.

## Whoop integratie — aandachtspunten
- Refresh tokens zijn single-use: refresh vraagt `scope=offline` en draait onder een row lock (`with_for_update`).
- Sync draait onder `pg_advisory_xact_lock` — gelijktijdige syncs (React StrictMode in dev, 2 gunicorn workers) maakten eerder dubbele rijen. Sync ruimt dubbele dagen/workouts zelf op.
- `POST /api/sync/whoop?days=N` (default 30) om gaten op te vullen.
- Stappen: `step_count` uit `/cycle` (Whoop API sinds 2026-09-23), per cycle (wakker → wakker), gemapt op lokale startdatum. Open issue: lopende dag geeft soms nog `null`.

## Energie / TDEE
Eén berekening in `backend/app/services/energy.py` (Dashboard, calorie-historie en chat-context):
BMR (Mifflin-St Jeor) + TEF (10% BMR) + stappen × 0.04 kcal × gewicht/70 + workout kcal.
- Stappen = Whoop `step_count` minus Garmin workout-stappen (die zitten al in workout kcal).
- Vandaag: BMR+TEF geschaald op tijd van de dag, stappen tot nu toe tellen volledig; dag-schatting gebruikt max(stappen nu, 14-daags gemiddelde).
- Geen Whoop stappen → 14-daags gemiddelde → profiel `avg_daily_steps` → 10.000.

## Open punten
- Workout deduplicatie (Hevy > Garmin > Whoop) zit in frontend én `workout_utils.py` — hoort in `backend/app/routes/workouts.py`.
- Dashboard heeft een hardcoded ReferenceLine op 28 Mar in de weight chart.

---

## Handige context voor nieuwe sessies

### Als je nieuw bent in dit project, lees dit:
1. Backend op Azure, frontend PWA — beide in deze repo, push naar `master` deployt
2. Backend gebruikt **geen auth** (single user) — frontend stuurt gewoon requests
3. API base URL: `frontend/src/utils/api.js` (uit `VITE_API_BASE_URL`)

### Valkuilen
- Garmin scraping kan breken na Garmin update — niet afhankelijk van maken voor core features
- `photo_data` is base64 JPEG string — comprimeer op device voor upload
- Alle datums zijn `YYYY-MM-DD` strings, tijden zijn ISO 8601
- `balance` in TDEE is `consumed - burned` (negatief = deficit = goed voor afvallen)
