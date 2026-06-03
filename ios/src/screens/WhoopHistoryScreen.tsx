import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { api } from '../utils/api';
import { colors, card, spacing, radius } from '../utils/colors';
import SimpleBarChart from '../components/SimpleBarChart';

const PERIODS = [{ label: '1W', days: 7 }, { label: '1M', days: 30 }, { label: '3M', days: 90 }];

type WhoopEntry = {
  date: string;
  recovery_score: number | null;
  hrv_ms: number | null;
  resting_hr: number | null;
  respiratory_rate: number | null;
  sleep_score: number | null;
  sleep_duration_hours: number | null;
  sleep_needed_hours: number | null;
  sleep_consistency_pct: number | null;
  sleep_efficiency_pct: number | null;
  sleep_disturbances: number | null;
};

function avg(data: WhoopEntry[], key: keyof WhoopEntry): number | null {
  const vals = data.map(d => d[key]).filter(v => v != null) as number[];
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function fmtDate(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${m}`;
}

function StatCard({ label, value, unit, color }: { label: string; value: string | null; unit: string; color: string }) {
  return (
    <View style={[statStyles.box]}>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={[statStyles.value, { color }]}>
        {value ?? '—'}<Text style={statStyles.unit}> {unit}</Text>
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  box:   { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.md, flex: 1,
           shadowColor: '#000', shadowOffset: {width:0,height:1}, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  label: { fontSize: 9, color: colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  value: { fontSize: 18, fontWeight: '700' },
  unit:  { fontSize: 11, fontWeight: '400', color: colors.gray[400] },
});

function ChartSection({ title, avgLabel, children }: { title: string; avgLabel?: string; children: React.ReactNode }) {
  return (
    <View style={chartStyles.section}>
      <View style={chartStyles.header}>
        <Text style={chartStyles.title}>{title}</Text>
        {avgLabel && <Text style={chartStyles.avg}>{avgLabel}</Text>}
      </View>
      {children}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  title:   { fontSize: 12, fontWeight: '600', color: colors.gray[700] },
  avg:     { fontSize: 10, color: colors.gray[400] },
});

function SleepBarChart({ data, width }: { data: WhoopEntry[]; width: number }) {
  const filtered = data.filter(d => d.sleep_duration_hours != null || d.sleep_needed_hours != null);
  if (filtered.length < 2) return null;

  const H = 130, PAD = { top: 8, bottom: 20, left: 30, right: 4 };
  const W = width - PAD.left - PAD.right;
  const maxV = Math.max(...filtered.flatMap(d => [d.sleep_duration_hours ?? 0, d.sleep_needed_hours ?? 0]));
  const barW = Math.max(4, (W / filtered.length) / 3);

  const barH = (v: number) => ((v / maxV) * (H - PAD.top - PAD.bottom));
  const barY = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) - barH(v);

  const xIndices = filtered.length <= 4
    ? filtered.map((_, i) => i)
    : [0, Math.floor(filtered.length / 2), filtered.length - 1];

  return (
    <Svg width={width} height={H}>
      {filtered.map((d, i) => {
        const x = PAD.left + (i / filtered.length) * W + 2;
        const needed = d.sleep_needed_hours ?? 0;
        const slept = d.sleep_duration_hours ?? 0;
        return [
          <Rect key={`n${i}`} x={x} y={barY(needed)} width={barW} height={barH(needed)} fill="#e0e7ff" rx={2} />,
          <Rect key={`s${i}`} x={x + barW + 1} y={barY(slept)} width={barW} height={barH(slept)} fill="#818cf8" rx={2} />,
        ];
      })}
      {xIndices.map(i => (
        <SvgText key={i} x={PAD.left + (i / filtered.length) * W + barW}
          y={H - 4} fontSize={8} fill={colors.gray[400]} textAnchor="middle">
          {fmtDate(filtered[i].date)}
        </SvgText>
      ))}
    </Svg>
  );
}

function RecoveryTab({ data, width }: { data: WhoopEntry[]; width: number }) {
  const latest = data[data.length - 1] || {};
  const avgR   = avg(data, 'recovery_score');
  const avgH   = avg(data, 'hrv_ms');
  const avgRhr = avg(data, 'resting_hr');
  const avgRr  = avg(data, 'respiratory_rate');

  const toChart = (key: keyof WhoopEntry) =>
    data.map(d => ({ label: fmtDate(d.date), value: d[key] as number })).filter(p => p.value != null);

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <StatCard label="Recovery" value={latest.recovery_score != null ? `${latest.recovery_score}` : null} unit="%" color={colors.status.green} />
        <StatCard label="HRV" value={latest.hrv_ms != null ? String(Math.round(latest.hrv_ms)) : null} unit="ms" color={colors.macro.protein} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <StatCard label="Resting HR" value={latest.resting_hr != null ? `${latest.resting_hr}` : null} unit="bpm" color={colors.macro.fat} />
        <StatCard label="Resp. Rate" value={latest.respiratory_rate != null ? latest.respiratory_rate.toFixed(1) : null} unit="rpm" color={colors.status.yellow} />
      </View>

      <View style={card}>
        <ChartSection title="Recovery Score" avgLabel={avgR != null ? `avg ${Math.round(avgR)}%` : undefined}>
          <SimpleBarChart data={toChart('recovery_score')} width={width - 64} height={110} color={colors.status.green} avgLine={avgR ?? undefined} />
        </ChartSection>
        <ChartSection title="HRV" avgLabel={avgH != null ? `avg ${Math.round(avgH)} ms` : undefined}>
          <SimpleBarChart data={toChart('hrv_ms')} width={width - 64} height={110} color={colors.macro.protein} avgLine={avgH ?? undefined} />
        </ChartSection>
        <ChartSection title="Resting HR" avgLabel={avgRhr != null ? `avg ${Math.round(avgRhr)} bpm` : undefined}>
          <SimpleBarChart data={toChart('resting_hr')} width={width - 64} height={110} color={colors.macro.fat} avgLine={avgRhr ?? undefined} />
        </ChartSection>
        <ChartSection title="Respiratory Rate" avgLabel={avgRr != null ? `avg ${avgRr.toFixed(1)} rpm` : undefined}>
          <SimpleBarChart data={toChart('respiratory_rate')} width={width - 64} height={110} color={colors.status.yellow} avgLine={avgRr ?? undefined} />
        </ChartSection>
      </View>
    </View>
  );
}

function SleepTab({ data, width }: { data: WhoopEntry[]; width: number }) {
  const latest = data[data.length - 1] || {};
  const avgCons = avg(data, 'sleep_consistency_pct');
  const avgEff  = avg(data, 'sleep_efficiency_pct');

  const toChart = (key: keyof WhoopEntry) =>
    data.map(d => ({ label: fmtDate(d.date), value: d[key] as number })).filter(p => p.value != null);

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <StatCard label="Sleep Score" value={latest.sleep_score != null ? `${latest.sleep_score}` : null} unit="%" color="#a78bfa" />
        <StatCard label="Slept" value={latest.sleep_duration_hours?.toFixed(1) ?? null} unit="h" color="#818cf8" />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <StatCard label="Needed" value={latest.sleep_needed_hours?.toFixed(1) ?? null} unit="h" color="#6366f1" />
        <StatCard label="Disturbances" value={latest.sleep_disturbances != null ? `${latest.sleep_disturbances}` : null} unit="" color={colors.status.orange} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <StatCard label="Consistency" value={latest.sleep_consistency_pct != null ? `${latest.sleep_consistency_pct}` : null} unit="%" color="#8b5cf6" />
        <StatCard label="Efficiency" value={latest.sleep_efficiency_pct != null ? `${latest.sleep_efficiency_pct}` : null} unit="%" color="#06b6d4" />
      </View>

      <View style={card}>
        <ChartSection title="Sleep vs Needed">
          <Text style={{ fontSize: 10, color: colors.gray[400], marginBottom: 4 }}>Purple = slept · Light = needed</Text>
          <SleepBarChart data={data} width={width - 64} />
        </ChartSection>
        <ChartSection title="Consistency" avgLabel={avgCons != null ? `avg ${Math.round(avgCons)}%` : undefined}>
          <SimpleBarChart data={toChart('sleep_consistency_pct')} width={width - 64} height={110} color="#8b5cf6" avgLine={avgCons ?? undefined} />
        </ChartSection>
        <ChartSection title="Efficiency" avgLabel={avgEff != null ? `avg ${Math.round(avgEff)}%` : undefined}>
          <SimpleBarChart data={toChart('sleep_efficiency_pct')} width={width - 64} height={110} color="#06b6d4" avgLine={avgEff ?? undefined} />
        </ChartSection>
        <ChartSection title="Disturbances">
          <SimpleBarChart data={toChart('sleep_disturbances')} width={width - 64} height={110} color={colors.status.orange} />
        </ChartSection>
      </View>
    </View>
  );
}

export default function WhoopHistoryScreen({ navigation, route }: any) {
  const initialTab = route?.params?.initialTab ?? 'recovery';
  const [days, setDays] = useState(7);
  const [tab, setTab] = useState<'recovery' | 'sleep'>(initialTab);
  const [data, setData] = useState<WhoopEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();

  useEffect(() => {
    setLoading(true);
    api.get(`/api/whoop/history?days=${days}`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={styles.tabs}>
            <TouchableOpacity onPress={() => setTab('recovery')} style={[styles.tab, tab === 'recovery' && styles.tabActive]}>
              <Text style={[styles.tabTxt, tab === 'recovery' && styles.tabActiveTxt]}>Recovery</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('sleep')} style={[styles.tab, tab === 'sleep' && styles.tabActive]}>
              <Text style={[styles.tabTxt, tab === 'sleep' && styles.tabActiveTxt]}>Sleep</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.periods}>
            {PERIODS.map(p => (
              <TouchableOpacity key={p.days} onPress={() => setDays(p.days)}
                style={[styles.periodBtn, days === p.days && styles.periodActive]}>
                <Text style={[styles.periodTxt, days === p.days && styles.periodActiveTxt]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand[500]} style={{ marginTop: 40 }} />
        ) : data.length === 0 ? (
          <Text style={styles.empty}>No data for this period.</Text>
        ) : tab === 'recovery' ? (
          <RecoveryTab data={data} width={width} />
        ) : (
          <SleepTab data={data} width={width} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: colors.bg },
  content:         { padding: spacing.lg, gap: spacing.md },
  header:          { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backBtn:         { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  backArrow:       { fontSize: 18, color: colors.gray[600] },
  tabs:            { flexDirection: 'row', backgroundColor: colors.gray[100], borderRadius: radius.xl, padding: 4, gap: 4 },
  tab:             { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.lg },
  tabActive:       { backgroundColor: colors.white, shadowColor: '#000', shadowOffset: {width:0,height:1}, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 },
  tabTxt:          { fontSize: 12, fontWeight: '500', color: colors.gray[400] },
  tabActiveTxt:    { color: colors.gray[800] },
  periods:         { flexDirection: 'row', gap: 4, marginLeft: 'auto' },
  periodBtn:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.md },
  periodActive:    { backgroundColor: colors.brand[500] },
  periodTxt:       { fontSize: 12, fontWeight: '500', color: colors.gray[400] },
  periodActiveTxt: { color: colors.white },
  empty:           { textAlign: 'center', color: colors.gray[400], marginTop: 40 },
});
