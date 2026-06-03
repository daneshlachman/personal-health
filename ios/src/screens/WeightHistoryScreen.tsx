import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, Image,
  Dimensions, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../utils/api';
import PlusButton from '../components/PlusButton';
import { colors, card, spacing, radius } from '../utils/colors';
import LineChart from '../components/LineChart';

const PERIODS = [
  { label: '1W', days: 7 }, { label: '1M', days: 30 },
  { label: '2M', days: 60 }, { label: '3M', days: 90 },
  { label: '6M', days: 180 }, { label: '1Y', days: 365 },
];
const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

type Entry = { id: string; date: string; weight_kg: number; source: string; photo_data?: string };

function fmtDate(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH[m - 1]}`;
}

function KPI({ label, value, sub, color }: { label: string; value: string | null; sub?: string; color?: string }) {
  return (
    <View style={kpiStyles.box}>
      <Text style={kpiStyles.label}>{label}</Text>
      <Text style={[kpiStyles.value, color ? { color } : {}]}>{value ?? '—'}</Text>
      {sub && <Text style={kpiStyles.sub}>{sub}</Text>}
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  box:   { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.md, flex: 1, shadowColor: '#000', shadowOffset: {width:0,height:1}, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  label: { fontSize: 9, color: colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  value: { fontSize: 18, fontWeight: '700', color: colors.gray[900] },
  sub:   { fontSize: 10, color: colors.gray[400], marginTop: 1 },
});

export default function WeightHistoryScreen({ navigation }: any) {
  const [days, setDays] = useState(7);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [allEntries, setAllEntries] = useState<Entry[]>([]); // voor foto galerij altijd alles
  const [loading, setLoading] = useState(true);
  const [modalEntry, setModalEntry] = useState<Entry | null | undefined>(undefined);
  const [photoEntry, setPhotoEntry] = useState<Entry | null>(null);
  const { width } = useWindowDimensions();

  const fetch_ = (d: number) => {
    setLoading(true);
    Promise.all([
      api.get(`/api/weight?days=${d}`),
      api.get('/api/weight?days=3650'),
    ]).then(([r, all]) => {
      setEntries(r.data);
      setAllEntries(all.data);
    }).catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch_(days); }, [days]);

  const handleDelete = (id: string) => {
    Alert.alert('Delete', 'Remove this entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        api.delete(`/api/weight/${id}`).then(() => setEntries(prev => prev.filter(e => e.id !== id)));
      }},
    ]);
  };

  const handleSaved = (result: Entry, isNew: boolean) => {
    if (isNew) setEntries(prev => [...prev, result].sort((a, b) => a.date.localeCompare(b.date)));
    else setEntries(prev => prev.map(e => e.id === result.id ? result : e));
  };

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const kgs = sorted.map(e => e.weight_kg);
  const latest = kgs[kgs.length - 1];
  const first = kgs[0];
  const change = latest != null && first != null ? +(latest - first).toFixed(1) : null;
  const changePct = change != null && first ? +((change / first) * 100).toFixed(1) : null;
  const minW = kgs.length ? Math.min(...kgs) : null;
  const maxW = kgs.length ? Math.max(...kgs) : null;
  const avg = kgs.length ? +(kgs.reduce((a, b) => a + b, 0) / kgs.length).toFixed(1) : null;
  const changeColor = change == null ? undefined : change < 0 ? colors.status.green : change > 0 ? colors.status.red : undefined;

  const chartData = sorted.map(e => ({ label: fmtDate(e.date), value: e.weight_kg }));
  const photos = [...allEntries].sort((a, b) => b.date.localeCompare(a.date)).filter(e => e.photo_data);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Weight</Text>
          <View style={styles.periods}>
            {PERIODS.map(p => (
              <TouchableOpacity key={p.days} onPress={() => setDays(p.days)}
                style={[styles.periodBtn, days === p.days && styles.periodActive]}>
                <Text style={[styles.periodText, days === p.days && styles.periodActiveText]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* KPIs */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiRow}>
            <KPI label="Current" value={latest ? `${latest} kg` : null} />
            <KPI label={`Change (${PERIODS.find(p => p.days === days)?.label})`}
              value={change != null ? `${change > 0 ? '+' : ''}${change} kg` : null}
              sub={changePct != null ? `${changePct > 0 ? '+' : ''}${changePct}%` : undefined}
              color={changeColor} />
          </View>
          <View style={styles.kpiRow}>
            <KPI label="Lowest"  value={minW ? `${minW} kg` : null} />
            <KPI label="Highest" value={maxW ? `${maxW} kg` : null} />
          </View>
          <View style={styles.kpiRow}>
            <KPI label="Average" value={avg ? `${avg} kg` : null} />
            <KPI label="Entries" value={kgs.length ? String(kgs.length) : null} sub="logged" />
          </View>
        </View>

        {/* Chart */}
        <View style={card}>
          {loading ? <ActivityIndicator color={colors.brand[500]} /> : chartData.length < 2 ? (
            <Text style={styles.empty}>Not enough data for this period.</Text>
          ) : (
            <LineChart data={chartData} width={width - 64} height={180} avgLine={avg ?? undefined} />
          )}
        </View>

        {/* Photo gallery */}
        {photos.length > 0 && (
          <View style={card}>
            <Text style={styles.sectionTitle}>PHOTOS · TAP 2 TO COMPARE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg }} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
              {photos.map(e => (
                <TouchableOpacity key={e.id} onPress={() => setPhotoEntry(e)}
                  style={styles.photoThumb}>
                  <Image source={{ uri: e.photo_data }} style={styles.photoImg} />
                  <View style={styles.photoLabel}>
                    <Text style={styles.photoKg}>{e.weight_kg}kg</Text>
                    <Text style={styles.photoDate}>{fmtDate(e.date)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Entries */}
        <View style={card}>
          <View style={styles.entriesHeader}>
            <Text style={styles.sectionTitle}>ENTRIES</Text>
            <PlusButton onPress={() => setModalEntry(null)} size={28} />
          </View>
          {[...entries].sort((a, b) => b.date.localeCompare(a.date)).map(e => (
            <View key={e.id} style={styles.entryRow}>
              {e.photo_data ? (
                <TouchableOpacity onPress={() => setPhotoEntry(e)}>
                  <Image source={{ uri: e.photo_data }} style={styles.entryThumb} />
                </TouchableOpacity>
              ) : (
                <View style={styles.entryIcon}><Text style={{ fontSize: 20 }}>⚖️</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.entryKg}>{e.weight_kg} kg</Text>
                <Text style={styles.entryMeta}>{fmtDate(e.date)} · {e.source || 'manual'}</Text>
              </View>
              <TouchableOpacity onPress={() => setModalEntry(e)} style={styles.actionBtn}>
                <Text style={styles.editIcon}>✎</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(e.id)} style={styles.actionBtn}>
                <Text style={styles.deleteIcon}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Modals */}
      {modalEntry !== undefined && (
        <WeightModal entry={modalEntry} onClose={() => setModalEntry(undefined)} onSaved={handleSaved} />
      )}
      {photoEntry && (
        <PhotoModal entry={photoEntry} onClose={() => setPhotoEntry(null)} />
      )}
    </SafeAreaView>
  );
}

function WeightModal({ entry, onClose, onSaved }: { entry: Entry | null; onClose: () => void; onSaved: (r: Entry, isNew: boolean) => void }) {
  const isNew = !entry;
  const [kg, setKg] = useState(entry ? String(entry.weight_kg) : '');
  const [date, setDate] = useState(entry?.date ?? new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const save = () => {
    const w = parseFloat(kg);
    if (!w) return;
    setSaving(true);
    const req = isNew
      ? api.post('/api/weight', { weight_kg: w, date })
      : api.put(`/api/weight/${entry!.id}`, { weight_kg: w, date });
    req.then(r => { onSaved(r.data, isNew); onClose(); })
      .catch(console.error)
      .finally(() => setSaving(false));
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={mStyles.overlay} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity style={mStyles.sheet} activeOpacity={1}>
          <View style={mStyles.header}>
            <Text style={mStyles.title}>{isNew ? 'Add entry' : 'Edit entry'}</Text>
            <TouchableOpacity onPress={onClose}><Text style={mStyles.close}>×</Text></TouchableOpacity>
          </View>
          <View style={mStyles.row}>
            <View style={{ flex: 1 }}>
              <Text style={mStyles.label}>Weight (kg)</Text>
              <TextInput style={mStyles.input} value={kg} onChangeText={setKg}
                keyboardType="decimal-pad" autoFocus placeholder="0.0" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={mStyles.label}>Date</Text>
              <TextInput style={mStyles.input} value={date} onChangeText={setDate} />
            </View>
          </View>
          <TouchableOpacity style={[mStyles.saveBtn, (!kg || saving) && { opacity: 0.4 }]}
            onPress={save} disabled={!kg || saving}>
            <Text style={mStyles.saveTxt}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function PhotoModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={pStyles.bg}>
        <View style={pStyles.topBar}>
          <View style={pStyles.zoomBtns}>
            <TouchableOpacity onPress={() => setScale(s => Math.max(1, +(s - 0.5).toFixed(1)))} style={pStyles.zBtn}>
              <Text style={pStyles.zTxt}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScale(s => Math.min(4, +(s + 0.5).toFixed(1)))} style={pStyles.zBtn}>
              <Text style={pStyles.zTxt}>+</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={onClose} style={pStyles.closeBtn}>
            <Text style={pStyles.closeTxt}>×</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Image source={{ uri: entry.photo_data }} resizeMode="contain"
            style={{ width: '100%', height: '100%', transform: [{ scale }] }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: colors.bg },
  content:           { padding: spacing.lg, gap: spacing.md },
  header:            { gap: spacing.sm },
  backBtn:           { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  backArrow:         { fontSize: 18, color: colors.gray[600] },
  title:             { fontSize: 28, fontWeight: '700', color: colors.gray[900] },
  periods:           { flexDirection: 'row', gap: 4 },
  periodBtn:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.md },
  periodActive:      { backgroundColor: colors.brand[500] },
  periodText:        { fontSize: 12, fontWeight: '500', color: colors.gray[400] },
  periodActiveText:  { color: colors.white },
  kpiGrid:           { gap: spacing.sm },
  kpiRow:            { flexDirection: 'row', gap: spacing.sm },
  empty:             { textAlign: 'center', color: colors.gray[400], paddingVertical: spacing.xl },
  sectionTitle:      { fontSize: 10, fontWeight: '700', color: colors.gray[400], letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing.sm },
  photoThumb:        { width: 110, height: 110, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.gray[100] },
  photoImg:          { width: '100%', height: '100%' },
  photoLabel:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', padding: 4 },
  photoKg:           { color: colors.white, fontSize: 11, fontWeight: '700' },
  photoDate:         { color: 'rgba(255,255,255,0.7)', fontSize: 9 },
  entriesHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  entryRow:          { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.gray[100] },
  entryThumb:        { width: 44, height: 44, borderRadius: radius.md },
  entryIcon:         { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  entryKg:           { fontSize: 15, fontWeight: '600', color: colors.gray[900] },
  entryMeta:         { fontSize: 12, color: colors.gray[400] },
  actionBtn:         { padding: spacing.xs },
  editIcon:          { fontSize: 16, color: colors.gray[300] },
  deleteIcon:        { fontSize: 20, color: colors.gray[300] },
});

const mStyles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'flex-end' },
  sheet:    { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, gap: spacing.lg },
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:    { fontSize: 15, fontWeight: '600', color: colors.gray[700] },
  close:    { fontSize: 24, color: colors.gray[400] },
  row:      { flexDirection: 'row', gap: spacing.md },
  label:    { fontSize: 12, color: colors.gray[400], marginBottom: 4 },
  input:    { borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, color: colors.gray[900] },
  saveBtn:  { backgroundColor: colors.brand[500], borderRadius: radius.xl, paddingVertical: 12, alignItems: 'center' },
  saveTxt:  { color: colors.white, fontWeight: '600', fontSize: 15 },
});

const pStyles = StyleSheet.create({
  bg:       { flex: 1, backgroundColor: '#000' },
  topBar:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: 52, paddingBottom: spacing.md },
  zoomBtns: { flexDirection: 'row', gap: spacing.md },
  zBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  zTxt:     { color: colors.white, fontSize: 20, fontWeight: '700' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: colors.white, fontSize: 22 },
});
