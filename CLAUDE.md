# Danesh Health — Project Documentation

## Wat is dit?
Personal health dashboard dat data uit Whoop, Garmin en Hevy samenvoegt met AI-powered voedingslogging via Claude. Begonnen als React PWA, wordt herbouwd als native iOS app (React Native + Expo).

## Repo structuur
```
danesh-health/
  backend/        Flask REST API (Python) — gedeeld door PWA én iOS app
  frontend/       React + Vite PWA (bestaand, referentie voor design)
  ios/            React Native + Expo app (in ontwikkeling)
  CLAUDE.md       Dit bestand
```

---

## Backend (Flask — niet aanpassen tenzij nodig)

**URL productie:** via Azure Container Apps (zie `.env`)
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

## iOS App (React Native + Expo)

**Locatie:** `ios/`
**Stack:** Expo SDK, React Native, TypeScript

### Navigatie structuur
```
App
└─ BottomTabNavigator
   ├─ Dashboard (tab 1)
   │   ├─ WhoopHistoryScreen (push)
   │   ├─ WeightHistoryScreen (push)
   │   └─ CaloriesHistoryScreen (push)
   ├─ Nutrition (tab 2)
   │   └─ FoodSearchModal (modal)
   ├─ Workouts (tab 3)
   │   └─ WorkoutDetailScreen (push)
   └─ Chat (tab 4)
```

### Design systeem (overnemen van PWA)

**Kleuren**
```javascript
export const colors = {
  brand: {
    50:  '#f0f9ff',
    500: '#0ea5e9',   // primair — sky blue
    600: '#0284c7',
    700: '#0369a1',
  },
  status: {
    green:  '#22c55e',
    red:    '#ef4444',
    yellow: '#eab308',
    orange: '#f97316',
  },
  macro: {
    protein: '#60a5fa',   // blue
    carbs:   '#fbbf24',   // amber
    fat:     '#fb7185',   // rose
  },
  bg:    '#f1f5f9',   // lichtgrijs pagina achtergrond
  card:  '#ffffff',
  gray: {
    100: '#f3f4f6',
    200: '#e5e7eb',
    400: '#9ca3af',
    600: '#4b5563',
    900: '#111827',
  }
}
```

**Whoop ring kleuren (recovery)**
- ≥ 67%: groen (#22c55e)
- ≥ 34%: geel (#eab308)
- < 34%: rood (#ef4444)

**Whoop ring kleuren (sleep)**
- ≥ 85%: groen
- ≥ 70%: blauw (brand-500)
- < 70%: rood

**Spacing & radius**
```javascript
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 }
export const radius  = { sm: 8, md: 12, lg: 16, xl: 20, full: 9999 }
```

**Card stijl**
```javascript
{ backgroundColor: '#fff', borderRadius: 16, padding: 16,
  shadowColor: '#000', shadowOffset: {width:0, height:1},
  shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }
```

### Schermen & wat ze doen

**DashboardScreen**
- Date nav (gisteren/vandaag/morgen, kalender picker)
- 2×2 Whoop rings (recovery, sleep, HRV, resting HR)
- Calorie kaarten: Burned / Consumed / Balance
- Mini weight chart (1W)
- Sync knop Whoop

**NutritionScreen**
- Grote calorie ring + 3 macro rings (protein/carbs/fat)
- Maaltijd secties: Breakfast, Lunch, Dinner, Snacks
- Per item: description, kcal, P/C/F macro badges, delete
- + knop opent FoodSearchModal (USDA + OpenFoodFacts)

**WorkoutsScreen**
- Kalender met emoji indicators (💪🚲🏃)
- Workout kaart per dag: titel, duur, source
- Hevy: sets/reps/gewicht per oefening
- Garmin: afstand, HR, hoogteverschil, kaart (MapKit)
- Sync knop

**WeightHistoryScreen**
- KPI grid (huidig, verandering, laagste, hoogste, gemiddelde)
- LineChart gewicht
- Foto galerij (horizontaal scrollbaar)
- Compare screen (split-screen 2 foto's, zoom knoppen)
- Edit/delete modal

**WhoopHistoryScreen**
- Tab: Recovery / Sleep
- KPI grid + LineCharts per metric

**ChatScreen**
- Datum nav
- Berichtenbubbles (user rechts brand-500, assistant links wit)
- Markdown rendering voor assistant berichten
- Claude logt voedsel automatisch als je het vertelt

### Voortgang

#### ✅ Gebouwd & werkend (getest in browser)
- Expo project init + navigatie structuur
- API client (axios) → `ios/src/utils/api.ts`, URL: `https://danesh-health-backend.agreeableground-243793ea.northeurope.azurecontainerapps.io`
- Design tokens → `ios/src/utils/colors.ts`
- `RingChart` component → `ios/src/components/RingChart.tsx` (SVG circulaire progress)
- `DateNav` component → `ios/src/components/DateNav.tsx` (herbruikbare datum nav)
- `LineChart` component → `ios/src/components/LineChart.tsx` (custom SVG lijn chart)
- **DashboardScreen** → Whoop rings + calorie kaarten (tappable → CaloriesHistory) + weight chart (tappable → WeightHistory)
- **NutritionScreen** → calorie ring + 3 macro rings + maaltijdsecties met delete
- **WorkoutsScreen** → maandkalender met emoji's, uitklapbare workout kaarten (Hevy sets/reps, Garmin stats), sync knop, deduplicatie (Hevy > Garmin > Whoop)
- **ChatScreen** → berichtenbubbles, markdown rendering, cleanReply (JSON blocks weggehaald), datum nav
- **WeightHistoryScreen** → KPI grid, lijn chart met periode knoppen, foto galerij (horizontaal), entries list met edit/delete/add modal
- **CaloriesHistoryScreen** → KPI cards, heatmap kalender (klikbaar, deficit=groen/surplus=oranje), wekelijks staafdiagram
- Stack navigatie voor Dashboard tab (DashboardMain → WeightHistory / CaloriesHistory)

#### 📋 Nog te bouwen
- **WhoopHistoryScreen** — referentie: `frontend/src/components/WhoopHistory.jsx` (recovery tab + sleep tab, KPI grid, LineCharts)
- **FoodSearchModal** in Nutrition — referentie: `frontend/src/components/NutritionLog.jsx` → `FoodSearchModal`
- **AI Quick Log** in Nutrition (`POST /api/nutrition/log-ai`) — al in PWA, nog niet in iOS
- **Foto upload** in WeightHistory — `expo-image-picker`, comprimeer naar base64 JPEG
- **Compare screen** in WeightHistory (2 foto's naast elkaar + zoom knoppen)
- **Whoop sync knop** op Dashboard
- **HealthKit** integratie — via `react-native-health` (later, optioneel)

#### 🔧 Bekende issues / TODO
- Testen op echte iPhone: werklaptop firewall blokkeert tunnel. Thuis: `npx expo start` → Expo Go scannen
- Dashboard heeft nog geen date picker kalender (alleen DateNav pijltjes)

#### 🏗️ Architectuur verbeteringen (later oppakken)
- **Workout deduplicatie hoort in de backend**: nu op 3 plekken (`workout_utils.py`, `WorkoutLog.jsx`, `WorkoutsScreen.tsx`). Fix: `dedupe_workouts()` in `backend/app/routes/workouts.py` vóór de return.

#### 🔧 Dev setup
- Werklaptop: `npx expo start` + `w` voor browser preview (geen tunnel mogelijk door firewall)
- Thuis/privé laptop: `npx expo start` → scan QR in Expo Go app op iPhone
- Backend URL: `https://danesh-health-backend.agreeableground-243793ea.northeurope.azurecontainerapps.io`
- Frontend lokaal: `cd frontend && npm run dev` (vereist `frontend/.env.local` met `VITE_API_BASE_URL=<backend-url>`)

---

## Handige context voor nieuwe sessies

### Als je nieuw bent in dit project, lees dit:
1. De **backend** staat op Azure en hoeft niet aangeraakt te worden
2. De **PWA** in `frontend/` is het referentie-design — we bouwen dit na in React Native
3. De **iOS app** staat in `ios/` — dit is waar we aan werken
4. Backend gebruikt **geen auth** (single user) — iOS app stuurt gewoon requests, geen tokens nodig
5. API base URL staat in `ios/src/utils/api.ts` als `API_BASE`

### Valkuilen
- Garmin scraping kan breken na Garmin update — niet afhankelijk van maken voor core features
- `photo_data` is base64 JPEG string — comprimeer op device voor upload
- Alle datums zijn `YYYY-MM-DD` strings, tijden zijn ISO 8601
- `balance` in TDEE is `consumed - burned` (negatief = deficit = goed voor afvallen)
