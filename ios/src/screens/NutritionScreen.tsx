import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, today } from '../utils/api';
import { colors, card, spacing, radius } from '../utils/colors';
import RingChart from '../components/RingChart';
import DateNav from '../components/DateNav';
import FoodSearchModal from '../components/FoodSearchModal';

const GOALS = { calories: 2400, protein_g: 180, carbs_g: 240, fat_g: 80 };
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const MEAL_LABELS: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

type Entry = { id: string; meal_type: string; description: string; calories: number; protein_g: number; carbs_g: number; fat_g: number };

// ── Quick AI Log Modal ────────────────────────────────────────────────────────
function QuickLogModal({ meal, date, onClose, onSaved }: { meal: string; date: string; onClose: () => void; onSaved: (e: Entry) => void }) {
  const [text, setText] = useState('');
  const [logging, setLogging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'logging' | 'done' | 'error'>('idle');

  const log = async () => {
    if (!text.trim()) return;
    setLogging(true); setStatus('logging');
    try {
      const r = await api.post('/api/nutrition/log-ai', { description: text.trim(), date, meal_type: meal });
      if (r.data.entries?.length) {
        r.data.entries.forEach((e: Entry) => onSaved(e));
        setStatus('done');
        setTimeout(onClose, 700);
      } else { setStatus('error'); }
    } catch { setStatus('error'); }
    finally { setLogging(false); }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={qlStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={qlStyles.sheet}>
          <View style={qlStyles.header}>
            <Text style={qlStyles.title}>What did you eat?</Text>
            <TouchableOpacity onPress={onClose}><Text style={qlStyles.close}>×</Text></TouchableOpacity>
          </View>
          <TextInput autoFocus value={text} onChangeText={setText} multiline
            onSubmitEditing={log} placeholder="e.g. 100g oatmeal, 200ml milk, 30g whey myprotein"
            placeholderTextColor={colors.gray[400]} style={qlStyles.input} />
          {status === 'logging' && <Text style={qlStyles.statusLogging}>⏳ Logging with AI…</Text>}
          {status === 'done'    && <Text style={qlStyles.statusDone}>✓ Logged!</Text>}
          {status === 'error'   && <Text style={qlStyles.statusError}>Something went wrong, try again.</Text>}
          <TouchableOpacity onPress={log} disabled={logging || !text.trim()}
            style={[qlStyles.btn, (logging || !text.trim()) && { opacity: 0.4 }]}>
            <Text style={qlStyles.btnTxt}>{logging ? 'Logging…' : 'Log my food'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const qlStyles = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 40, gap: spacing.md },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:         { fontSize: 14, fontWeight: '600', color: colors.gray[700] },
  close:         { fontSize: 24, color: colors.gray[400] },
  input:         { borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.xl, padding: spacing.md, fontSize: 16, color: colors.gray[900], minHeight: 80, textAlignVertical: 'top' },
  statusLogging: { fontSize: 12, color: colors.brand[500], textAlign: 'center' },
  statusDone:    { fontSize: 12, color: colors.status.green, textAlign: 'center' },
  statusError:   { fontSize: 12, color: colors.status.red, textAlign: 'center' },
  btn:           { backgroundColor: colors.brand[500], borderRadius: radius.xl, paddingVertical: 12, alignItems: 'center' },
  btnTxt:        { color: colors.white, fontWeight: '600', fontSize: 15 },
});

// ── Edit Entry Modal ──────────────────────────────────────────────────────────
function EditEntryModal({ entry, onClose, onSaved }: { entry: Entry; onClose: () => void; onSaved: (e: Entry) => void }) {
  const amountMatch = entry.description.match(/(\d+(?:[.,]\d+)?)\s*(g|ml|kg|l)\b/i);
  const baseAmount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;
  const unit = amountMatch ? amountMatch[2] : '';

  const [kcal, setKcal]       = useState(String(Math.round(entry.calories ?? 0)));
  const [protein, setProtein] = useState(String(+(entry.protein_g ?? 0).toFixed(1)));
  const [carbs, setCarbs]     = useState(String(+(entry.carbs_g ?? 0).toFixed(1)));
  const [fat, setFat]         = useState(String(+(entry.fat_g ?? 0).toFixed(1)));
  const [amount, setAmount]   = useState(amountMatch ? amountMatch[1] : '');
  const [saving, setSaving]   = useState(false);

  const fmt = (n: number) => String(+n.toFixed(1));

  const onAmount = (val: string) => {
    setAmount(val);
    const newA = parseFloat(val) || 0;
    if (baseAmount && baseAmount > 0 && newA > 0) {
      const r = newA / baseAmount;
      const p = (entry.protein_g ?? 0) * r;
      const c = (entry.carbs_g ?? 0) * r;
      const f = (entry.fat_g ?? 0) * r;
      setProtein(fmt(p)); setCarbs(fmt(c)); setFat(fmt(f));
      setKcal(String(Math.round(p * 4 + c * 4 + f * 9)));
    }
  };

  const onMacro = (field: string, val: string, setter: (v: string) => void) => {
    setter(val);
    const p = field === 'p' ? (parseFloat(val)||0) : (parseFloat(protein)||0);
    const c = field === 'c' ? (parseFloat(val)||0) : (parseFloat(carbs)||0);
    const f = field === 'f' ? (parseFloat(val)||0) : (parseFloat(fat)||0);
    setKcal(String(Math.round(p * 4 + c * 4 + f * 9)));
  };

  const onKcal = (val: string) => {
    setKcal(val);
    const newK = parseFloat(val) || 0;
    const curK = (parseFloat(protein)||0)*4 + (parseFloat(carbs)||0)*4 + (parseFloat(fat)||0)*9;
    if (curK > 0 && newK > 0) {
      const r = newK / curK;
      setProtein(fmt((parseFloat(protein)||0)*r));
      setCarbs(fmt((parseFloat(carbs)||0)*r));
      setFat(fmt((parseFloat(fat)||0)*r));
    }
  };

  const save = () => {
    setSaving(true);
    api.put(`/api/nutrition/${entry.id}`, {
      calories: parseFloat(kcal)||0, protein_g: parseFloat(protein)||0,
      carbs_g: parseFloat(carbs)||0, fat_g: parseFloat(fat)||0,
    }).then(r => { onSaved(r.data); onClose(); })
      .catch(console.error).finally(() => setSaving(false));
  };

  const iCls = emStyles.input;
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={emStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={emStyles.sheet}>
          <View style={emStyles.header}>
            <Text style={emStyles.title} numberOfLines={1}>{entry.description}</Text>
            <TouchableOpacity onPress={onClose}><Text style={emStyles.close}>×</Text></TouchableOpacity>
          </View>
          {baseAmount && (
            <View>
              <Text style={emStyles.lbl}>Amount ({unit})</Text>
              <TextInput value={amount} onChangeText={onAmount} keyboardType="decimal-pad" autoComplete="off" style={iCls} />
            </View>
          )}
          <View style={emStyles.grid}>
            <View style={emStyles.cell}>
              <Text style={emStyles.lbl}>Calories (kcal)</Text>
              <TextInput value={kcal} onChangeText={onKcal} keyboardType="decimal-pad" autoComplete="off" style={iCls} />
            </View>
            <View style={emStyles.cell}>
              <Text style={[emStyles.lbl, { color: colors.macro.protein }]}>Protein (g)</Text>
              <TextInput value={protein} onChangeText={v => onMacro('p', v, setProtein)} keyboardType="decimal-pad" autoComplete="off" style={iCls} />
            </View>
            <View style={emStyles.cell}>
              <Text style={[emStyles.lbl, { color: colors.macro.carbs }]}>Carbs (g)</Text>
              <TextInput value={carbs} onChangeText={v => onMacro('c', v, setCarbs)} keyboardType="decimal-pad" autoComplete="off" style={iCls} />
            </View>
            <View style={emStyles.cell}>
              <Text style={[emStyles.lbl, { color: colors.macro.fat }]}>Fat (g)</Text>
              <TextInput value={fat} onChangeText={v => onMacro('f', v, setFat)} keyboardType="decimal-pad" autoComplete="off" style={iCls} />
            </View>
          </View>
          <TouchableOpacity onPress={save} disabled={saving} style={[emStyles.btn, saving && { opacity: 0.4 }]}>
            <Text style={emStyles.btnTxt}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const emStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 40, gap: spacing.md },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:   { fontSize: 14, fontWeight: '600', color: colors.gray[700], flex: 1, marginRight: spacing.md },
  close:   { fontSize: 24, color: colors.gray[400] },
  grid:    { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cell:    { width: '47%' },
  lbl:     { fontSize: 11, color: colors.gray[400], marginBottom: 4 },
  input:   { borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.gray[900] },
  btn:     { backgroundColor: colors.brand[500], borderRadius: radius.xl, paddingVertical: 12, alignItems: 'center' },
  btnTxt:  { color: colors.white, fontWeight: '600', fontSize: 15 },
});

// ── Meal Section ──────────────────────────────────────────────────────────────
function MealSection({ meal, entries, onDelete, onAdd, onQuickLog, onEdit }: {
  meal: string; entries: Entry[];
  onDelete: (id: string) => void;
  onAdd: () => void;
  onQuickLog: () => void;
  onEdit: (e: Entry) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const total = entries.reduce((s, e) => ({ cal: s.cal + (e.calories||0), p: s.p + (e.protein_g||0), c: s.c + (e.carbs_g||0), f: s.f + (e.fat_g||0) }), { cal:0, p:0, c:0, f:0 });

  return (
    <View style={msStyles.card}>
      {/* Header */}
      <View style={msStyles.header}>
        <Text style={msStyles.mealTitle}>{MEAL_LABELS[meal]?.toUpperCase()}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {entries.length > 0 && <Text style={msStyles.kcalMeta}>{Math.round(total.cal)} kcal</Text>}
          <View style={{ position: 'relative' }}>
            <TouchableOpacity onPress={() => setMenuOpen(o => !o)} style={msStyles.addBtn}>
              <View style={msStyles.plusCircle}>
                <Text style={msStyles.plusTxt}>+</Text>
              </View>
            </TouchableOpacity>
            {menuOpen && (
              <View style={msStyles.dropdown}>
                <TouchableOpacity onPress={() => { setMenuOpen(false); onQuickLog(); }} style={msStyles.dropItem}>
                  <Text style={msStyles.dropTxt}>✦  Log with AI</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setMenuOpen(false); onAdd(); }} style={msStyles.dropItem}>
                  <Text style={msStyles.dropTxt}>🔍  Manual</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Entries */}
      {entries.length === 0 ? (
        <TouchableOpacity onPress={onQuickLog} style={msStyles.emptyRow}>
          <Text style={msStyles.emptyTxt}>✦  Describe what you ate…</Text>
        </TouchableOpacity>
      ) : (
        <>
          {entries.map(e => (
            <View key={e.id} style={msStyles.entryRow}>
              <View style={{ flex: 1 }}>
                <Text style={msStyles.entryDesc}>{e.description}</Text>
                <View style={msStyles.macroRow}>
                  <Text style={msStyles.kcalTag}>{Math.round(e.calories ?? 0)} kcal</Text>
                  <Text style={[msStyles.macroTag, { color: colors.macro.protein }]}>P {Math.round(e.protein_g ?? 0)}g</Text>
                  <Text style={[msStyles.macroTag, { color: colors.macro.carbs }]}>C {Math.round(e.carbs_g ?? 0)}g</Text>
                  <Text style={[msStyles.macroTag, { color: colors.macro.fat }]}>F {Math.round(e.fat_g ?? 0)}g</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => onEdit(e)} style={msStyles.iconBtn}>
                <Text style={msStyles.editIcon}>✎</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(e.id)} style={msStyles.iconBtn}>
                <Text style={msStyles.deleteIcon}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          {/* Total row if >1 entry */}
          {entries.length > 1 && (
            <View style={msStyles.totalRow}>
              <Text style={msStyles.totalLabel}>Total</Text>
              <Text style={msStyles.totalKcal}>{Math.round(total.cal)} kcal</Text>
              <Text style={[msStyles.macroTag, { color: colors.macro.protein }]}>P {Math.round(total.p)}g</Text>
              <Text style={[msStyles.macroTag, { color: colors.macro.carbs }]}>C {Math.round(total.c)}g</Text>
              <Text style={[msStyles.macroTag, { color: colors.macro.fat }]}>F {Math.round(total.f)}g</Text>
            </View>
          )}
          {/* Always show AI describe button at bottom */}
          <TouchableOpacity onPress={onQuickLog} style={msStyles.aiBottomBtn}>
            <Text style={msStyles.emptyTxt}>✦  Describe what you ate…</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const msStyles = StyleSheet.create({
  card:        { backgroundColor: colors.white, borderRadius: radius.xl, shadowColor: '#000', shadowOffset: {width:0,height:1}, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, overflow: 'visible' },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 10, backgroundColor: colors.gray[50], borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  mealTitle:   { fontSize: 11, fontWeight: '700', color: colors.gray[600], letterSpacing: 0.8 },
  kcalMeta:    { fontSize: 11, color: colors.gray[400] },
  addBtn:      { },
  plusCircle:  { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brand[500], alignItems: 'center', justifyContent: 'center' },
  plusTxt:     { color: colors.white, fontSize: 18, lineHeight: 22, marginTop: -1 },
  dropdown:    { position: 'absolute', right: 0, top: 28, zIndex: 20, backgroundColor: colors.white, borderRadius: radius.xl, shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity: 0.12, shadowRadius: 8, elevation: 8, minWidth: 140, paddingVertical: 4 },
  dropItem:    { paddingHorizontal: spacing.lg, paddingVertical: 10 },
  dropTxt:     { fontSize: 14, color: colors.gray[700] },
  emptyRow:    { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  emptyTxt:    { fontSize: 12, color: colors.gray[400] },
  entryRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.gray[50] },
  entryDesc:   { fontSize: 14, color: colors.gray[800], marginBottom: 2 },
  macroRow:    { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  kcalTag:     { fontSize: 11, color: colors.gray[600], fontWeight: '500' },
  macroTag:    { fontSize: 11, fontWeight: '600' },
  iconBtn:     { paddingHorizontal: 6, paddingVertical: 4 },
  editIcon:    { fontSize: 16, color: colors.brand[400] },
  deleteIcon:  { fontSize: 20, color: colors.status.red },
  totalRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 10, backgroundColor: colors.gray[50], borderTopWidth: 1, borderTopColor: colors.gray[100] },
  totalLabel:  { fontSize: 11, fontWeight: '700', color: colors.gray[700], marginRight: 4 },
  totalKcal:   { fontSize: 11, fontWeight: '700', color: colors.gray[700] },
  aiBottomBtn: { paddingHorizontal: spacing.lg, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.gray[50] },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function NutritionScreen() {
  const [date, setDate] = useState(today());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [quickLogMeal, setQuickLogMeal] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);

  const fetch_ = (d: string) => {
    setLoading(true);
    api.get(`/api/nutrition?date=${d}`)
      .then(r => setEntries(r.data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch_(date); }, [date]);

  const totalCal = entries.reduce((s, e) => s + (e.calories || 0), 0);
  const totalP   = entries.reduce((s, e) => s + (e.protein_g || 0), 0);
  const totalC   = entries.reduce((s, e) => s + (e.carbs_g || 0), 0);
  const totalF   = entries.reduce((s, e) => s + (e.fat_g || 0), 0);

  const handleDelete = (id: string) => {
    Alert.alert('Delete', 'Remove this entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        api.delete(`/api/nutrition/${id}`)
          .then(() => setEntries(prev => prev.filter(e => e.id !== id)))
          .catch(console.error);
      }},
    ]);
  };

  const handleSaved = (entry: Entry) => setEntries(prev => [...prev, entry]);
  const handleUpdated = (updated: Entry) => setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));

  const byMeal = (meal: string) => entries.filter(e => e.meal_type === meal);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <DateNav date={date} onChange={setDate} />

        {/* Calorie + macro rings */}
        <View style={[card, styles.ringsCard]}>
          <View style={styles.bigRingRow}>
            <RingChart value={totalCal} max={GOALS.calories} color={colors.brand[500]} size={120} stroke={10} unit="kcal" />
            <View>
              <Text style={styles.bigVal}>{Math.round(totalCal)}</Text>
              <Text style={styles.bigSub}>of {GOALS.calories} kcal</Text>
            </View>
          </View>
          <View style={styles.macroRow}>
            <RingChart value={Math.round(totalP)} max={GOALS.protein_g} color={colors.macro.protein} size={72} stroke={6} label="Protein" unit="g" />
            <RingChart value={Math.round(totalC)} max={GOALS.carbs_g}   color={colors.macro.carbs}   size={72} stroke={6} label="Carbs"   unit="g" />
            <RingChart value={Math.round(totalF)} max={GOALS.fat_g}     color={colors.macro.fat}     size={72} stroke={6} label="Fat"     unit="g" />
          </View>
        </View>

        {/* Meal sections */}
        {loading ? <ActivityIndicator color={colors.brand[500]} style={{ marginTop: 32 }} /> : (
          MEALS.map(meal => (
            <MealSection key={meal} meal={meal} entries={byMeal(meal)}
              onDelete={handleDelete}
              onAdd={() => setAddingTo(meal)}
              onQuickLog={() => setQuickLogMeal(meal)}
              onEdit={e => setEditEntry(e)}
            />
          ))
        )}
      </ScrollView>

      {addingTo && <FoodSearchModal meal={addingTo} date={date} onClose={() => setAddingTo(null)} onSaved={handleSaved} />}
      {quickLogMeal && <QuickLogModal meal={quickLogMeal} date={date} onClose={() => setQuickLogMeal(null)} onSaved={handleSaved} />}
      {editEntry && <EditEntryModal entry={editEntry} onClose={() => setEditEntry(null)} onSaved={handleUpdated} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: colors.bg },
  content:    { padding: spacing.lg, gap: spacing.md },
  ringsCard:  { alignItems: 'center', gap: spacing.lg },
  bigRingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  bigVal:     { fontSize: 36, fontWeight: '700', color: colors.gray[900] },
  bigSub:     { fontSize: 13, color: colors.gray[400] },
  macroRow:   { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
});
