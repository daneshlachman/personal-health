import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { api } from '../utils/api';
import { searchCommon } from '../utils/commonFoods';
import { colors, spacing, radius } from '../utils/colors';

const MEAL_LABELS: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

type FoodItem = {
  name?: string; product_name?: string; brand?: string; brands?: string;
  calories_100g?: number; protein_100g?: number; carbs_100g?: number; fat_100g?: number;
  nutriments?: { 'energy-kcal_100g'?: number; proteins_100g?: number; carbohydrates_100g?: number; fat_100g?: number };
};

type Props = { meal: string; date: string; onClose: () => void; onSaved: (entry: any) => void };

export default function FoodSearchModal({ meal, date, onClose, onSaved }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState('100');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    // Show local results immediately
    const local = searchCommon(query);
    setResults(local);
    const timer = setTimeout(() => {
      setSearching(true);
      api.get(`/api/food/search?q=${encodeURIComponent(query)}`)
        .then(r => {
          const localNames = new Set(local.map(f => f.product_name));
          const remote = r.data.filter((f: any) => !localNames.has(f.name));
          setResults([...local, ...remote]);
        })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const g = parseFloat(grams) || 0;
  const factor = g / 100;
  const cal100  = selected?.calories_100g ?? selected?.nutriments?.['energy-kcal_100g'] ?? 0;
  const pro100  = selected?.protein_100g  ?? selected?.nutriments?.proteins_100g ?? 0;
  const carb100 = selected?.carbs_100g    ?? selected?.nutriments?.carbohydrates_100g ?? 0;
  const fat100  = selected?.fat_100g      ?? selected?.nutriments?.fat_100g ?? 0;
  const calories = Math.round(cal100 * factor);
  const protein  = Math.round(pro100  * factor * 10) / 10;
  const carbs    = Math.round(carb100 * factor * 10) / 10;
  const fat      = Math.round(fat100  * factor * 10) / 10;

  const save = () => {
    if (!selected || !g) return;
    setSaving(true);
    const name  = selected.name || selected.product_name || '';
    const brand = selected.brand || selected.brands?.split(',')[0].trim() || '';
    const description = `${name}${brand ? ` (${brand})` : ''} ${g}g`;
    api.post('/api/nutrition', { date, meal_type: meal, description, calories, protein_g: protein, carbs_g: carbs, fat_g: fat })
      .then(r => { onSaved(r.data); onClose(); })
      .catch(console.error)
      .finally(() => setSaving(false));
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Add to {MEAL_LABELS[meal] || meal}</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.close}>×</Text></TouchableOpacity>
          </View>

          {!selected ? (
            <>
              <TextInput
                autoFocus value={query} onChangeText={setQuery}
                placeholder="Search food…" placeholderTextColor={colors.gray[400]}
                style={styles.input} autoComplete="off" />
              {searching && <Text style={styles.hint}>Searching…</Text>}
              {!searching && query.length >= 2 && results.length === 0 && (
                <Text style={styles.hint}>No results found.</Text>
              )}
              <FlatList
                data={results} keyExtractor={(_, i) => String(i)}
                style={{ maxHeight: 280 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: p }) => (
                  <TouchableOpacity onPress={() => { setSelected(p); setGrams('100'); }} style={styles.resultRow}>
                    <Text style={styles.resultName}>{p.name || p.product_name}</Text>
                    <Text style={styles.resultMeta}>
                      {(p.brand || p.brands?.split(',')[0].trim()) ? `${p.brand || p.brands!.split(',')[0].trim()} · ` : ''}
                      {Math.round(p.calories_100g ?? p.nutriments?.['energy-kcal_100g'] ?? 0)} kcal / 100g
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => setSelected(null)} style={styles.backBtn}>
                <Text style={styles.backTxt}>‹ Back</Text>
              </TouchableOpacity>
              <Text style={styles.selectedName}>{selected.name || selected.product_name}</Text>

              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Amount</Text>
                <TextInput value={grams} onChangeText={setGrams} keyboardType="decimal-pad"
                  autoComplete="off" style={styles.amountInput} />
                <Text style={styles.amountLabel}>g</Text>
              </View>

              <View style={styles.macroPreview}>
                {[['kcal', String(calories), colors.gray[900]], ['protein', `${protein}g`, colors.macro.protein],
                  ['carbs', `${carbs}g`, colors.macro.carbs], ['fat', `${fat}g`, colors.macro.fat]].map(([lbl, val, clr]) => (
                  <View key={lbl} style={styles.macroCell}>
                    <Text style={[styles.macroVal, { color: clr as string }]}>{val}</Text>
                    <Text style={styles.macroLbl}>{lbl}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity onPress={save} disabled={saving || !g}
                style={[styles.saveBtn, (saving || !g) && { opacity: 0.4 }]}>
                <Text style={styles.saveTxt}>{saving ? 'Saving…' : `Add to ${MEAL_LABELS[meal] || meal}`}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 40, gap: spacing.md },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:        { fontSize: 14, fontWeight: '600', color: colors.gray[700] },
  close:        { fontSize: 24, color: colors.gray[400] },
  input:        { borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, color: colors.gray[900] },
  hint:         { fontSize: 12, color: colors.gray[400], textAlign: 'center', marginTop: 4 },
  resultRow:    { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg },
  resultName:   { fontSize: 14, fontWeight: '500', color: colors.gray[800] },
  resultMeta:   { fontSize: 11, color: colors.gray[400], marginTop: 1 },
  backBtn:      { alignSelf: 'flex-start' },
  backTxt:      { fontSize: 13, color: colors.brand[500] },
  selectedName: { fontSize: 14, fontWeight: '600', color: colors.gray[800] },
  amountRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  amountLabel:  { fontSize: 14, color: colors.gray[600] },
  amountInput:  { borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, textAlign: 'center', width: 80, color: colors.gray[900] },
  macroPreview: { flexDirection: 'row', backgroundColor: colors.gray[50], borderRadius: radius.xl, padding: spacing.md },
  macroCell:    { flex: 1, alignItems: 'center' },
  macroVal:     { fontSize: 14, fontWeight: '700' },
  macroLbl:     { fontSize: 9, color: colors.gray[400], marginTop: 2 },
  saveBtn:      { backgroundColor: colors.brand[500], borderRadius: radius.xl, paddingVertical: 12, alignItems: 'center' },
  saveTxt:      { color: colors.white, fontWeight: '600', fontSize: 15 },
});
