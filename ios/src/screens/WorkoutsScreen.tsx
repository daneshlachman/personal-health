import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

function WorkoutCard({ workout: w }: { workout: Workout }) {
  const [expanded, setExpanded] = useState(true);
  const rj = w.raw_json || {};
  const isGarmin = w.source === 'garmin';
  const isHevy = w.source === 'hevy';

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

      {expanded && isHevy && w.exercises && (
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

      {expanded && isGarmin && (
        <View style={styles.garminStats}>
          {rj.distance    && <StatRow label="Distance"   value={`${(rj.distance / 1000).toFixed(2)} km`} />}
          {rj.averageHR   && <StatRow label="Avg HR"     value={`${rj.averageHR} bpm`} />}
          {rj.maxHR       && <StatRow label="Max HR"     value={`${rj.maxHR} bpm`} />}
          {rj.calories    && <StatRow label="Calories"   value={`${rj.calories} kcal`} />}
          {rj.elevationGain && <StatRow label="Elevation" value={`+${Math.round(rj.elevationGain)} m`} />}
        </View>
      )}
    </View>
  );
}

function Tag({ text }: { text: string }) {
  return <View style={styles.tag}><Text style={styles.tagText}>{text}</Text></View>;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
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
  cardHeader:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardEmoji:     { fontSize: 28 },
  cardMeta:      { flex: 1 },
  cardTitle:     { fontSize: 15, fontWeight: '600', color: colors.gray[900], marginBottom: 4 },
  cardTags:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag:           { backgroundColor: colors.gray[100], borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tagText:       { fontSize: 11, color: colors.gray[600], fontWeight: '500' },
  chevron:       { fontSize: 12, color: colors.gray[400] },
  exercises:     { marginTop: spacing.md, gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray[100], paddingTop: spacing.md },
  exercise:      { gap: spacing.xs },
  exTitle:       { fontSize: 13, fontWeight: '600', color: colors.gray[800] },
  sets:          { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  set:           { fontSize: 12, color: colors.gray[500], backgroundColor: colors.gray[50], paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  garminStats:   { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray[100], paddingTop: spacing.md, gap: spacing.xs },
  statRow:       { flexDirection: 'row', justifyContent: 'space-between' },
  statLabel:     { fontSize: 13, color: colors.gray[400] },
  statValue:     { fontSize: 13, fontWeight: '600', color: colors.gray[900] },
});
