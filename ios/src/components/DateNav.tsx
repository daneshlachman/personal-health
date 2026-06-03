import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing } from '../utils/colors';
import MiniCalendar from './MiniCalendar';

type Props = { date: string; onChange: (d: string) => void };

function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function label(iso: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = addDays(today, -1);
  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function DateNav({ date, onChange }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [calOpen, setCalOpen] = useState(false);

  return (
    <>
      <View style={styles.row}>
        <TouchableOpacity onPress={() => onChange(addDays(date, -1))} style={styles.btn}>
          <Text style={styles.arrow}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCalOpen(true)} style={styles.labelBtn}>
          <Text style={styles.label}>{label(date)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onChange(addDays(date, 1))} style={styles.btn}
          disabled={date >= today}>
          <Text style={[styles.arrow, date >= today && styles.disabled]}>›</Text>
        </TouchableOpacity>
      </View>

      {calOpen && (
        <MiniCalendar
          selected={date}
          onSelect={onChange}
          onClose={() => setCalOpen(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  btn:       { padding: spacing.sm },
  arrow:     { fontSize: 24, color: colors.gray[600], fontWeight: '300' },
  disabled:  { color: colors.gray[200] },
  labelBtn:  { paddingVertical: 4, paddingHorizontal: 8 },
  label:     { fontSize: 17, fontWeight: '600', color: colors.gray[900], minWidth: 100, textAlign: 'center' },
});
