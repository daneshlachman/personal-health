@AGENTS.md

# iOS App — Danesh Health

## Stack
- **Expo SDK 53** (React Native)
- **TypeScript**
- **React Navigation** (bottom tabs + native stack)
- **Axios** voor API calls
- **react-native-svg** voor RingChart + LineChart
- **react-native-markdown-display** voor Chat
- **react-zoom-pan-pinch** voor foto zoom (WeightHistory)
- **react-native-safe-area-context**

## Starten
```bash
cd ios
npx expo start          # dan 'w' voor browser preview (werklaptop)
npx expo start --tunnel # thuis, dan QR scannen in Expo Go
```

## Backend
URL: `https://danesh-health-backend.agreeableground-243793ea.northeurope.azurecontainerapps.io`
Staat in `src/utils/api.ts` als `API_BASE`.
Geen auth — single user setup.

## Folder structuur
```
ios/src/
  screens/
    DashboardScreen.tsx      ✅ Whoop rings, calorie cards, weight chart
    NutritionScreen.tsx      ✅ Macro rings, maaltijdsecties, delete
    WorkoutsScreen.tsx       ✅ Kalender, workout kaarten, deduplicatie
    ChatScreen.tsx           ✅ Bubbles, markdown, cleanReply
    WeightHistoryScreen.tsx  ✅ KPI, chart, foto galerij, edit/delete
    CaloriesHistoryScreen.tsx ✅ Heatmap kalender, staafdiagram
  components/
    RingChart.tsx     SVG circulaire progress ring
    DateNav.tsx       Datum navigatie (← Today →)
    LineChart.tsx     Custom SVG lijn chart
  utils/
    api.ts    axios client + API_BASE + today()
    colors.ts design tokens (kleuren, spacing, radius, card stijl)
```

## Design tokens (altijd gebruiken uit colors.ts)
```typescript
colors.brand[500]  // #0ea5e9 — primair blauw
colors.bg          // #f1f5f9 — pagina achtergrond
colors.card        // #ffffff
colors.gray[400]   // labels/meta tekst
colors.status.green / red / yellow / orange
colors.macro.protein / carbs / fat
card               // standaard card stijl (shadow, radius, padding)
```

## Navigatie
```
App
└─ BottomTabNavigator (Dashboard, Nutrition, Workouts, Chat)
   └─ DashboardStack (NativeStack)
       ├─ DashboardMain
       ├─ WeightHistory
       └─ CaloriesHistory
```

## PWA referentie
De PWA in `../frontend/src/components/` is het referentie-design.
Bij twijfel over layout of logica: kijk daar eerst.

## Nog te bouwen
- WhoopHistoryScreen — zie `../frontend/src/components/WhoopHistory.jsx`
- FoodSearchModal in NutritionScreen — zie `../frontend/src/components/NutritionLog.jsx`
- AI Quick Log in NutritionScreen (`POST /api/nutrition/log-ai`)
- Foto upload in WeightHistoryScreen (`expo-image-picker`)
- Compare screen in WeightHistoryScreen
- Whoop sync knop op Dashboard

## Bekende valkuilen
- `text-base` (16px) op inputs — anders zoomt iOS in
- `autoComplete="off"` op alle invoervelden
- Workout deduplicatie: Hevy > Garmin > Whoop (zit in WorkoutsScreen.tsx, hoort eigenlijk in backend)
- Datums altijd als `YYYY-MM-DD` strings
- `balance` in TDEE = consumed - burned (negatief = deficit)
