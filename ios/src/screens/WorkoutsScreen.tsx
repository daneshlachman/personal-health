import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline, Rect } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import { api } from '../utils/api';
import { colors, card, spacing, radius } from '../utils/colors';

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

type Workout = {
  id: string; date: string; source: string; title: string; duration_minutes: number;
  exercises?: { title: string; sets: { weight_kg: number; reps: number; rpe?: number }[] }[];
  raw_json?: any;
};

const STRENGTH_NAMES = new Set(['weightlifting', 'functional fitness', 'crossfit', 'powerlifting', 'olympic weightlifting', 'strength training', 'bodybuilding']);
const CYCLING_NAMES  = new Set(['cycling', 'commuting', 'mountain biking', 'road cycling', 'indoor cycling', 'bmx']);

function isStrength(w: Workout) {
  return STRENGTH_NAMES.has((w.raw_json?.sport_name || w.title || '').toLowerCase());
}

// Priority: Hevy > Garmin > Whoop (same as PWA)
function dedupeWorkouts(workouts: Workout[]): Workout[] {
  const hevyDates  = new Set(workouts.filter(w => w.source === 'hevy').map(w => w.date));
  const garminDates = new Set(workouts.filter(w => w.source === 'garmin').map(w => w.date));
  return workouts.filter(w => {
    if (w.source === 'whoop' && isStrength(w) && (hevyDates.has(w.date) || garminDates.has(w.date))) return false;
    if (w.source === 'whoop' && !isStrength(w) && garminDates.has(w.date)) return false;
    if (w.source === 'garmin' && isStrength(w) && hevyDates.has(w.date)) return false;
    return true;
  });
}

function workoutEmoji(w: Workout) {
  const t = (w.title || '').toLowerCase();
  if (w.source === 'hevy') return '💪';
  if (CYCLING_NAMES.has(t) || t.includes('cycl') || t.includes('fiet') || t.includes('ride') || t.includes('bike')) return '🚲';
  if (t.includes('run') || t.includes('loop')) return '🏃';
  if (isStrength(w)) return '💪';
  return '🏋️';
}

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = (first.getDay() + 6) % 7; // Mon=0
  const days: (number | null)[] = Array(startDow).fill(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

// ── Route map als SVG ─────────────────────────────────────────────────────────
function RouteMap({ points, width }: { points: [number, number][]; width: number }) {
  if (!points || points.length < 2) return null;
  const H = 180;

  // On native: use Leaflet in WebView
  if (Platform.OS !== 'web') {
    const coords = JSON.stringify(points);
    const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>body,html,#map{margin:0;padding:0;width:100%;height:100%}</style>
</head><body>
<div id="map"></div>
<script>
var pts = ${coords};
var map = L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
var poly = L.polyline(pts,{color:'#f97316',weight:3}).addTo(map);
map.fitBounds(poly.getBounds(),{padding:[10,10]});
</script></body></html>`;
    return (
      <View style={{ height: H, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.md }}>
        <WebView source={{ html }} style={{ flex: 1 }} scrollEnabled={false} />
      </View>
    );
  }

  // Web fallback: SVG polyline met juiste aspect ratio
  const PAD = 16, W = width - PAD * 2, Hc = H - PAD * 2;
  const lats = points.map(p => p[0]), lons = points.map(p => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const lr = maxLat - minLat || 0.001, lonr = maxLon - minLon || 0.001;
  const scale = Math.min(W / lonr, Hc / lr);
  const offX = (W - lonr * scale) / 2;
  const offY = (Hc - lr * scale) / 2;
  const px = (lon: number) => PAD + offX + (lon - minLon) * scale;
  const py = (lat: number) => PAD + offY + (maxLat - lat) * scale;
  const polyline = points.map(p => `${px(p[1])},${py(p[0])}`).join(' ');
  return (
    <View style={{ borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.md, backgroundColor: '#dde3ea' }}>
      <Svg width={width} height={H}>
        <Rect x={0} y={0} width={width} height={H} fill="#dde3ea" />
        <Polyline points={polyline} fill="none" stroke={colors.status.orange} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function fmt(minutes: number) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function WorkoutsScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(now.toISOString().slice(0, 10));
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/api/workouts?limit=100')
      .then(r => setWorkouts(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      await Promise.all([
        api.post('/api/sync/hevy'),
        api.post('/api/sync/garmin'),
      ]);
      const r = await api.get('/api/workouts?limit=100');
      setWorkouts(r.data);
    } catch {}
    setSyncing(false);
  };

  const days = getMonthDays(year, month);
  const todayStr = now.toISOString().slice(0, 10);

  // Dedupliceer: Hevy > Garmin > Whoop (zelfde logica als PWA)
  const deduped = dedupeWorkouts(workouts);

  const byDate: Record<string, Workout[]> = {};
  deduped.forEach(w => {
    if (!byDate[w.date]) byDate[w.date] = [];
    byDate[w.date].push(w);
  });

  const dayWorkouts = byDate[selectedDate] || [];

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Workouts</Text>
          <TouchableOpacity onPress={sync} disabled={syncing} style={styles.syncBtn}>
            {syncing ? <ActivityIndicator size="small" color={colors.brand[500]} /> :
              <Text style={styles.syncText}>Sync</Text>}
          </TouchableOpacity>
        </View>

        {/* Calendar */}
        <View style={card}>
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
              <Text style={styles.navArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{MONTHS[month]} {year}</Text>
            <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
              <Text style={styles.navArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={styles.dayRow}>
            {DAYS.map(d => <Text key={d} style={styles.dayHeader}>{d}</Text>)}
          </View>

          {/* Grid */}
          {Array.from({ length: days.length / 7 }, (_, i) => (
            <View key={i} style={styles.dayRow}>
              {days.slice(i * 7, i * 7 + 7).map((d, j) => {
                if (!d) return <View key={j} style={styles.dayCell} />;
                const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const ws = byDate[iso] || [];
                const isSelected = iso === selectedDate;
                const isToday = iso === todayStr;
                return (
                  <TouchableOpacity key={j} style={[styles.dayCell, isSelected && styles.selectedCell]}
                    onPress={() => setSelectedDate(iso)}>
                    <Text style={[styles.dayNum, isSelected && styles.selectedNum, isToday && !isSelected && styles.todayNum]}>
                      {d}
                    </Text>
                    {ws.length > 0 && (
                      <Text style={styles.emoji}>{[...new Set(ws.map(workoutEmoji))].slice(0, 2).join('')}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <Text style={styles.selectedLabel}>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>

        {/* Workout cards for selected day */}
        {loading ? <ActivityIndicator color={colors.brand[500]} style={{ marginTop: 24 }} /> :
          dayWorkouts.length === 0 ? (
            <View style={[card, styles.emptyCard]}>
              <Text style={styles.emptyText}>No workouts on this day.</Text>
            </View>
          ) : (
            dayWorkouts.map(w => <WorkoutCard key={w.id} workout={w} />)
          )
        }
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Mini SVG line chart for speed/HR ─────────────────────────────────────────
function MetricChart({ data, dataKey, color, width }: { data: any[]; dataKey: string; color: string; width: number }) {
  const H = 70, PAD = { top: 4, bottom: 4, left: 0, right: 0 };
  const vals = data.map(d => d[dataKey]).filter(v => v != null && v > 0);
  if (vals.length < 2) return null;
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const W = width;
  const px = (i: number) => (i / (data.length - 1)) * W;
  const py = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - (v - minV) / range);
  const points = data
    .map((d, i) => d[dataKey] > 0 ? `${px(i)},${py(d[dataKey])}` : null)
    .filter(Boolean).join(' ');
  return (
    <Svg width={width} height={H}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── HR Zones ──────────────────────────────────────────────────────────────────
function HRZones({ raw }: { raw: any }) {
  const ZONE_COLORS = ['#93c5fd', '#4ade80', '#facc15', '#fb923c', '#ef4444'];
  const zones = [1,2,3,4,5].map((n, i) => ({
    label: `Z${n}`, time: raw[`hrTimeInZone_${n}`] || 0, color: ZONE_COLORS[i],
  })).filter(z => z.time > 0);
  if (!zones.length) return null;
  const total = zones.reduce((s, z) => s + z.time, 0);
  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  };
  return (
    <View style={gStyles.section}>
      <Text style={gStyles.sectionLabel}>HR ZONES</Text>
      {zones.map(z => (
        <View key={z.label} style={gStyles.zoneRow}>
          <Text style={gStyles.zoneLabel}>{z.label}</Text>
          <View style={gStyles.zoneBarBg}>
            <View style={[gStyles.zoneBarFill, { width: `${(z.time/total)*100}%` as any, backgroundColor: z.color }]} />
          </View>
          <Text style={gStyles.zoneTime}>{fmtTime(z.time)}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Garmin Stats ──────────────────────────────────────────────────────────────
function GarminStats({ workout }: { workout: Workout }) {
  const rj = workout.raw_json || {};
  const [metrics, setMetrics] = useState<any[]>([]);
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);
  const { width } = useWindowDimensions();
  const chartW = width - 80;

  const typeKey = (rj.activityType?.typeKey || '').toLowerCase();
  const title   = (rj.activityName || '').toLowerCase();
  const isRun   = typeKey.includes('run') || title.includes('run') || title.includes('hardloop');
  const km      = rj.distance ? (rj.distance / 1000).toFixed(2) : null;
  const avgKmh  = rj.averageSpeed ? (rj.averageSpeed * 3.6).toFixed(1) : null;
  const maxKmh  = rj.maxSpeed ? (rj.maxSpeed * 3.6).toFixed(1) : null;
  const pace    = rj.averageSpeed > 0
    ? (() => { const s = 1000 / rj.averageSpeed; return `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`; })()
    : null;
  const teLabel = rj.trainingEffectLabel?.toLowerCase().replace(/_/g, ' ');

  useEffect(() => {
    if (!rj.hasPolyline) return;
    api.get(`/api/workouts/${workout.id}/route`)
      .then(r => {
        setMetrics((r.data.metrics || []).filter((m: any) => m.hr || m.kmh));
        setRoutePoints(r.data.points || []);
      })
      .catch(() => {});
  }, [workout.id]);

  return (
    <View style={gStyles.container}>
      {/* Stats grid */}
      <View style={gStyles.grid}>
        {km           && <StatBlock label="Distance"     value={`${km} km`} />}
        {isRun && pace && <StatBlock label="Pace"        value={pace} sub="min/km" />}
        {avgKmh       && <StatBlock label="Avg speed"    value={`${avgKmh} km/h`} />}
        {!isRun && maxKmh && <StatBlock label="Max speed" value={`${maxKmh} km/h`} />}
        {rj.calories  > 0 && <StatBlock label="Calories"  value={`${Math.round(rj.calories)} kcal`} />}
        {rj.averageHR > 0 && <StatBlock label="Avg HR"    value={`${Math.round(rj.averageHR)} bpm`} />}
        {rj.maxHR     > 0 && <StatBlock label="Max HR"    value={`${Math.round(rj.maxHR)} bpm`} />}
      </View>

      {/* Route map */}
      {routePoints.length > 1 && <RouteMap points={routePoints} width={chartW} />}

      {/* Speed chart */}
      {metrics.length > 2 && (
        <View style={gStyles.section}>
          <Text style={gStyles.sectionLabel}>{isRun ? 'PACE (min/km)' : 'SPEED (km/h)'}</Text>
          <MetricChart data={metrics} dataKey="kmh" color={colors.status.orange} width={chartW} />
        </View>
      )}

      {/* HR chart */}
      {metrics.some(m => m.hr) && (
        <View style={gStyles.section}>
          <Text style={gStyles.sectionLabel}>HEART RATE (bpm)</Text>
          <MetricChart data={metrics} dataKey="hr" color={colors.status.red} width={chartW} />
        </View>
      )}

      <HRZones raw={rj} />
    </View>
  );
}

function StatBlock({ label, value, sub }: { label: string; value: any; sub?: string }) {
  if (!value) return null;
  return (
    <View style={gStyles.statBlock}>
      <Text style={gStyles.statVal}>{value}</Text>
      {sub && <Text style={gStyles.statSub}>{sub}</Text>}
      <Text style={gStyles.statLbl}>{label}</Text>
    </View>
  );
}

const gStyles = StyleSheet.create({
  container:    { paddingTop: spacing.md },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, paddingBottom: spacing.md },
  statBlock:    { width: '28%' },
  statVal:      { fontSize: 15, fontWeight: '700', color: colors.gray[900] },
  statSub:      { fontSize: 9, color: colors.gray[400] },
  statLbl:      { fontSize: 9, color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
  section:      { marginBottom: spacing.md },
  sectionLabel: { fontSize: 9, color: colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  zoneRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  zoneLabel:    { fontSize: 10, fontWeight: '500', color: colors.gray[500], width: 18 },
  zoneBarBg:    { flex: 1, height: 6, backgroundColor: colors.gray[100], borderRadius: radius.full, overflow: 'hidden' },
  zoneBarFill:  { height: '100%', borderRadius: radius.full },
  zoneTime:     { fontSize: 10, color: colors.gray[500], width: 50, textAlign: 'right' },
});

// ── Workout Card ──────────────────────────────────────────────────────────────
function WorkoutCard({ workout: w }: { workout: Workout }) {
  const rj = w.raw_json || {};
  const isGarmin = w.source === 'garmin';
  const isHevy   = w.source === 'hevy';

  return (
    <View style={card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji}>{workoutEmoji(w)}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.cardTitle}>{w.title || 'Workout'}</Text>
          <View style={styles.cardTags}>
            <Tag text={w.source} />
            {w.duration_minutes > 0 && <Tag text={fmt(w.duration_minutes)} />}
            {isGarmin && rj.distance && <Tag text={`${(rj.distance / 1000).toFixed(1)} km`} />}
            {isGarmin && rj.averageHR && <Tag text={`${rj.averageHR} bpm avg`} />}
          </View>
        </View>
      </View>

      {isHevy && w.exercises && (
        <View style={styles.exercises}>
          {w.exercises.map((ex, i) => (
            <View key={i} style={styles.exercise}>
              <Text style={styles.exTitle}>{ex.title}</Text>
              <View style={styles.sets}>
                {ex.sets.map((s, j) => (
                  <Text key={j} style={styles.set}>
                    {s.weight_kg > 0 ? `${s.weight_kg}kg × ` : ''}{s.reps} reps{s.rpe ? ` @ RPE ${s.rpe}` : ''}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {isGarmin && <GarminStats workout={w} />}
    </View>
  );
}

function Tag({ text }: { text: string }) {
  return <View style={styles.tag}><Text style={styles.tagText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.bg },
  content:       { padding: spacing.lg, gap: spacing.md },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:         { fontSize: 28, fontWeight: '700', color: colors.gray[900] },
  syncBtn:       { borderWidth: 1, borderColor: colors.brand[500], borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  syncText:      { color: colors.brand[500], fontWeight: '600', fontSize: 14 },
  calHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  navBtn:        { padding: spacing.sm },
  navArrow:      { fontSize: 22, color: colors.gray[600] },
  monthTitle:    { fontSize: 16, fontWeight: '600', color: colors.gray[900] },
  dayRow:        { flexDirection: 'row' },
  dayHeader:     { flex: 1, textAlign: 'center', fontSize: 11, color: colors.gray[400], fontWeight: '600', paddingVertical: spacing.xs },
  dayCell:       { flex: 1, alignItems: 'center', paddingVertical: spacing.xs, borderRadius: radius.md, minHeight: 44 },
  selectedCell:  { backgroundColor: colors.brand[500] },
  dayNum:        { fontSize: 14, color: colors.gray[900], fontWeight: '500' },
  selectedNum:   { color: colors.white, fontWeight: '700' },
  todayNum:      { color: colors.brand[500], fontWeight: '700' },
  emoji:         { fontSize: 12, marginTop: 1 },
  selectedLabel: { textAlign: 'center', fontSize: 13, color: colors.gray[400], marginTop: spacing.sm },
  emptyCard:     { alignItems: 'center', paddingVertical: spacing.xl },
  emptyText:     { color: colors.gray[400], fontSize: 14 },
  cardHeader:    { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardEmoji:     { fontSize: 28 },
  cardMeta:      { flex: 1 },
  cardTitle:     { fontSize: 15, fontWeight: '600', color: colors.gray[900], marginBottom: 4 },
  cardTags:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  tag:           { backgroundColor: colors.gray[100], borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tagText:       { fontSize: 11, color: colors.gray[600], fontWeight: '500' },
  chevron:       { fontSize: 12, color: colors.gray[400] },
  exercises:     { marginTop: spacing.md, gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray[100], paddingTop: spacing.md },
  exercise:      { gap: spacing.xs },
  exTitle:       { fontSize: 13, fontWeight: '600', color: colors.gray[800] },
  sets:          { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  set:           { fontSize: 12, color: colors.gray[500], backgroundColor: colors.gray[50], paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
});
