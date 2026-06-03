import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, today } from '../utils/api';
import { colors, card, spacing, radius } from '../utils/colors';
import RingChart from '../components/RingChart';
import DateNav from '../components/DateNav';
import LineChart from '../components/LineChart';

type WhoopData = { recovery_score: number | null; sleep_score: number | null; hrv_ms: number | null; resting_hr: number | null };
type TdeeData  = { burned_now: number; tdee: number; consumed: number; balance: number };
type WeightEntry = { date: string; weight_kg: number };

const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function WhoopSync() {
  const [syncing, setSyncing] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    api.get('/api/whoop/status').then(r => setConnected(r.data.connected)).catch(() => {});
  }, []);

  const sync = () => {
    setSyncing(true);
    api.post('/api/sync/whoop').finally(() => setSyncing(false));
  };

  if (connected === null) return null;
  return (
    <View style={syncStyles.row}>
      {connected ? (
        <TouchableOpacity onPress={sync} disabled={syncing} style={syncStyles.btn}>
          <Text style={syncStyles.btnTxt}>{syncing ? 'Syncing…' : 'Sync Whoop'}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => api.get('/api/whoop/authorize')} style={[syncStyles.btn, { backgroundColor: colors.gray[100] }]}>
          <Text style={[syncStyles.btnTxt, { color: colors.gray[600] }]}>Connect Whoop</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const syncStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', paddingBottom: spacing.sm },
  btn: { borderWidth: 1, borderColor: colors.brand[500], borderRadius: radius.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  btnTxt: { color: colors.brand[500], fontWeight: '600', fontSize: 14 },
});

function recoveryColor(s: number | null) {
  if (s == null) return colors.gray[400];
  return s >= 67 ? colors.status.green : s >= 34 ? colors.status.yellow : colors.status.red;
}
function sleepColor(s: number | null) {
  if (s == null) return colors.gray[400];
  return s >= 85 ? colors.status.green : s >= 70 ? colors.brand[500] : colors.status.red;
}

export default function DashboardScreen({ navigation }: any) {
  const [date, setDate]     = useState(today());
  const [whoop, setWhoop]   = useState<WhoopData | null>(null);
  const [tdee, setTdee]     = useState<TdeeData | null>(null);
  const [weight, setWeight] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/api/whoop/today?date=${date}`).then(r => setWhoop(r.data)).catch(() => {}),
      api.get(`/api/tdee/today?date=${date}`).then(r => setTdee(r.data)).catch(() => {}),
      api.get('/api/weight?days=7').then(r => setWeight(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [date]);

  const weightData = weight
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(w => {
      const [, m, d] = w.date.split('-').map(Number);
      return { label: `${d} ${MONTH[m - 1]}`, value: w.weight_kg };
    });

  const latestKg = weight.length ? weight[weight.length - 1]?.weight_kg : null;
  const firstKg  = weight.length ? weight[0]?.weight_kg : null;
  const weightChange = latestKg != null && firstKg != null ? +(latestKg - firstKg).toFixed(1) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <DateNav date={date} onChange={setDate} />

        {/* Whoop rings — tappable to WhoopHistory */}
        <View style={[card, styles.ringsCard]}>
          {loading ? <ActivityIndicator color={colors.brand[500]} /> : (
            <>
              <View style={styles.ringsGrid}>
                <TouchableOpacity onPress={() => navigation.navigate('WhoopHistory', { initialTab: 'recovery' })}>
                  <RingChart value={whoop?.recovery_score ?? null} max={100} color={recoveryColor(whoop?.recovery_score ?? null)} size={80} stroke={8} label="Recovery" unit="%" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('WhoopHistory', { initialTab: 'sleep' })}>
                  <RingChart value={whoop?.sleep_score ?? null} max={100} color={sleepColor(whoop?.sleep_score ?? null)} size={80} stroke={8} label="Sleep" unit="%" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('WhoopHistory', { initialTab: 'recovery' })}>
                  <RingChart value={whoop?.hrv_ms ? Math.round(whoop.hrv_ms) : null} max={120} color={colors.brand[500]} size={80} stroke={8} label="HRV (ms)" unit="ms" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('WhoopHistory', { initialTab: 'recovery' })}>
                  <RingChart value={whoop?.resting_hr ?? null} max={100} color={colors.status.red} size={80} stroke={8} label="Resting HR" unit="bpm" />
                </TouchableOpacity>
              </View>
              <Text style={styles.tapHint}>Tap a ring for history</Text>
            </>
          )}
        </View>

        {/* Calorie cards — tappable to CaloriesHistory */}
        <TouchableOpacity style={card} onPress={() => navigation.navigate('CaloriesHistory')} activeOpacity={0.85}>
          {tdee ? (
            <>
              <CalorieRow label="BURNED"   value={tdee.burned_now} goal={tdee.tdee}    barColor={colors.brand[500]} />
              <View style={styles.divider} />
              <CalorieRow label="CONSUMED" value={tdee.consumed}   goal={tdee.tdee}    barColor={colors.status.green} />
              <View style={styles.divider} />
              <View style={styles.balanceRow}>
                <Text style={styles.metaLabel}>BALANCE</Text>
                <View style={styles.balanceRight}>
                  <Text style={[styles.balanceVal, { color: tdee.balance < 0 ? colors.status.green : colors.status.red }]}>
                    {tdee.balance > 0 ? '+' : ''}{tdee.balance.toLocaleString()} kcal
                  </Text>
                  <View style={[styles.badge, { backgroundColor: tdee.balance < 0 ? '#dcfce7' : '#fee2e2' }]}>
                    <Text style={[styles.badgeTxt, { color: tdee.balance < 0 ? colors.status.green : colors.status.red }]}>
                      {tdee.balance < 0 ? 'Deficit' : 'Surplus'}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          ) : <ActivityIndicator color={colors.brand[500]} />}
        </TouchableOpacity>

        {/* Weight chart — tappable to WeightHistory */}
        <TouchableOpacity style={card} onPress={() => navigation.navigate('WeightHistory')} activeOpacity={0.85}>
          <View style={styles.weightHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={styles.sectionTitle}>WEIGHT</Text>
              {weightChange != null && (
                <Text style={[styles.weightChange, { color: weightChange <= 0 ? colors.status.green : colors.status.red }]}>
                  {weightChange <= 0 ? '↓' : '↑'} {Math.abs(weightChange)}kg
                </Text>
              )}
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
          {weightData.length > 1 ? (
            <LineChart data={weightData} width={width - 64} height={140} />
          ) : (
            <Text style={styles.noData}>No weight data this week</Text>
          )}
        </TouchableOpacity>

        {/* Whoop sync */}
        <WhoopSync />
      </ScrollView>
    </SafeAreaView>
  );
}

function CalorieRow({ label, value, goal, barColor }: { label: string; value: number; goal: number; barColor: string }) {
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  return (
    <View style={styles.calRow}>
      <View style={styles.calHeader}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaLabel}>est. {goal.toLocaleString()} kcal</Text>
      </View>
      <Text style={styles.calValue}>{value.toLocaleString()} <Text style={styles.calUnit}>kcal</Text></Text>
      <View style={styles.progressBg}>
        <View style={[styles.progressBar, { width: `${pct * 100}%` as any, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.bg },
  content:      { padding: spacing.lg, gap: spacing.md },
  ringsCard:    { alignItems: 'center' },
  ringsGrid:    { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: spacing.lg, width: '100%' },
  divider:      { height: 1, backgroundColor: colors.gray[100], marginVertical: spacing.sm },
  calRow:       { gap: spacing.xs },
  calHeader:    { flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel:    { fontSize: 11, fontWeight: '600', color: colors.gray[400], letterSpacing: 0.5, textTransform: 'uppercase' },
  calValue:     { fontSize: 28, fontWeight: '700', color: colors.gray[900] },
  calUnit:      { fontSize: 16, fontWeight: '400', color: colors.gray[400] },
  progressBg:   { height: 6, backgroundColor: colors.gray[100], borderRadius: radius.full, overflow: 'hidden' },
  progressBar:  { height: '100%', borderRadius: radius.full },
  balanceRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balanceVal:   { fontSize: 18, fontWeight: '700' },
  badge:        { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  badgeTxt:     { fontSize: 12, fontWeight: '600' },
  weightHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.gray[400], letterSpacing: 0.5, textTransform: 'uppercase' },
  weightChange: { fontSize: 13, fontWeight: '600' },
  tapHint:      { fontSize: 11, color: colors.gray[400], marginTop: 4 },
  chevron:      { fontSize: 18, color: colors.gray[400] },
  noData:       { color: colors.gray[400], fontSize: 13, textAlign: 'center', paddingVertical: spacing.lg },
});
