import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, useWindowDimensions, Modal, TextInput, Image, KeyboardAvoidingView, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path } from 'react-native-svg';
import PlusButton from '../components/PlusButton';
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

function WeightModal({ onClose, onSaved }: { onClose: () => void; onSaved: (e: any) => void }) {
  const [kg, setKg] = useState('');
  const [dateStr, setDateStr] = useState(today());
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const save = () => {
    const w = parseFloat(kg);
    if (!w) return;
    setSaving(true);
    api.post('/api/weight', { weight_kg: w, date: dateStr, photo_data: photo })
      .then(r => { onSaved(r.data); onClose(); })
      .catch(console.error)
      .finally(() => setSaving(false));
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={wmStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={wmStyles.sheet}>
          <View style={wmStyles.header}>
            <Text style={wmStyles.title}>Add weight</Text>
            <TouchableOpacity onPress={onClose}><Text style={wmStyles.close}>×</Text></TouchableOpacity>
          </View>
          <View style={wmStyles.row}>
            <View style={{ flex: 1 }}>
              <Text style={wmStyles.lbl}>Weight (kg)</Text>
              <TextInput autoFocus value={kg} onChangeText={setKg} keyboardType="decimal-pad"
                autoComplete="off" placeholder="0.0" placeholderTextColor={colors.gray[400]} style={wmStyles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={wmStyles.lbl}>Date</Text>
              <TextInput value={dateStr} onChangeText={setDateStr} autoComplete="off" style={wmStyles.input} />
            </View>
          </View>
          {photo ? (
            <View style={{ position: 'relative' }}>
              <Image source={{ uri: photo }} style={wmStyles.photoPreview} />
              <TouchableOpacity onPress={() => setPhoto(null)} style={wmStyles.photoRemove}>
                <Text style={{ color: colors.gray[600] }}>×</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={pickPhoto} style={wmStyles.photoPicker}>
              <Text style={wmStyles.photoPickerTxt}>+ Add photo (optional)</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={save} disabled={saving || !kg} style={[wmStyles.btn, (!kg || saving) && { opacity: 0.4 }]}>
            <Text style={wmStyles.btnTxt}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const wmStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 40, gap: spacing.md },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:   { fontSize: 14, fontWeight: '600', color: colors.gray[700] },
  close:   { fontSize: 24, color: colors.gray[400] },
  row:     { flexDirection: 'row', gap: spacing.md },
  lbl:     { fontSize: 11, color: colors.gray[400], marginBottom: 4 },
  input:   { borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.gray[900] },
  btn:          { backgroundColor: colors.brand[500], borderRadius: radius.xl, paddingVertical: 12, alignItems: 'center' },
  btnTxt:       { color: colors.white, fontWeight: '600', fontSize: 15 },
  photoPicker:  { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.gray[200], borderRadius: radius.xl, paddingVertical: 20, alignItems: 'center' },
  photoPickerTxt: { fontSize: 14, color: colors.gray[400] },
  photoPreview: { width: '100%', height: 160, borderRadius: radius.xl, resizeMode: 'cover' },
  photoRemove:  { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center' },
});

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
function hrvColor(hrv: number | null) {
  if (hrv == null) return colors.gray[400];
  return hrv >= 60 ? colors.status.green : hrv >= 40 ? colors.gray[400] : colors.status.red;
}
function rhrColor(rhr: number | null) {
  if (rhr == null) return colors.gray[400];
  return rhr < 60 ? colors.status.green : rhr <= 65 ? colors.gray[400] : colors.status.red;
}

export default function DashboardScreen({ navigation }: any) {
  const [date, setDate]        = useState(today());
  const [whoop, setWhoop]      = useState<WhoopData | null>(null);
  const [addingWeight, setAddingWeight] = useState(false);
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
        <View style={styles.topBar}>
          <View style={{ width: 36 }} />
          <DateNav date={date} onChange={setDate} />
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.gearBtn}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke={colors.gray[600]} strokeWidth={1.8} strokeLinecap="round" />
              <Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke={colors.gray[600]} strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
        </View>

        {/* Whoop rings — tappable to WhoopHistory */}
        <View style={[card, styles.ringsCard]}>
          {loading ? <ActivityIndicator color={colors.brand[500]} /> : (
            <>
              <View style={styles.ringsGrid}>
                {[
                  { value: whoop?.recovery_score ?? null, max: 100, color: recoveryColor(whoop?.recovery_score ?? null), label: 'Recovery', unit: '%', tab: 'recovery' },
                  { value: whoop?.sleep_score ?? null,    max: 100, color: sleepColor(whoop?.sleep_score ?? null),        label: 'Sleep',    unit: '%', tab: 'sleep' },
                  { value: whoop?.hrv_ms ? Math.round(whoop.hrv_ms) : null, max: 120, color: hrvColor(whoop?.hrv_ms ?? null), label: 'HRV (ms)', unit: 'ms', tab: 'recovery' },
                  { value: whoop?.resting_hr ?? null, max: 100, color: rhrColor(whoop?.resting_hr ?? null), label: 'Resting HR', unit: 'bpm', tab: 'recovery' },
                ].map(r => (
                  <TouchableOpacity key={r.label} style={styles.ringCell}
                    onPress={() => navigation.navigate('WhoopHistory', { initialTab: r.tab })}>
                    <RingChart value={r.value} max={r.max} color={r.color} size={80} stroke={8} label={r.label} unit={r.unit} />
                  </TouchableOpacity>
                ))}
              </View>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <PlusButton onPress={() => setAddingWeight(true)} size={26} />
            </View>
          </View>
          {weightData.length > 1 ? (
            <LineChart data={weightData} width={width - 64} height={140} />
          ) : (
            <Text style={styles.noData}>No weight data this week</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      {addingWeight && (
        <WeightModal
          onClose={() => setAddingWeight(false)}
          onSaved={() => { setAddingWeight(false); }}
        />
      )}
    </SafeAreaView>
  );
}

function CalorieRow({ label, value, goal, barColor }: { label: string; value: number; goal: number; barColor: string }) {
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  return (
    <View style={styles.calRow}>
      <View style={styles.calHeader}>
        <Text style={styles.metaLabel}>{label}</Text>
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
  content:      { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
  ringsCard:    { alignItems: 'center' },
  ringsGrid:    { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  ringCell:     { width: '50%', alignItems: 'center', paddingVertical: spacing.md },
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
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 0, marginBottom: spacing.sm },
  gearBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  chevron:      { fontSize: 18, color: colors.gray[400] },
  noData:       { color: colors.gray[400], fontSize: 13, textAlign: 'center', paddingVertical: spacing.lg },
});
