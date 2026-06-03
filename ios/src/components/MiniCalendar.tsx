import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../utils/colors';

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const today = new Date().toISOString().slice(0, 10);

type Props = { selected: string; onSelect: (iso: string) => void; onClose: () => void };

export default function MiniCalendar({ selected, onSelect, onClose }: Props) {
  const selDate = new Date(selected + 'T12:00:00');
  const [viewYear, setViewYear] = useState(selDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selDate.getMonth());

  const todayDate = new Date(today + 'T12:00:00');
  const firstDow   = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const monthLabel = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const atMax = viewYear > todayDate.getFullYear() ||
    (viewYear === todayDate.getFullYear() && viewMonth >= todayDate.getMonth());

  const cells: (number | null)[] = [...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity style={styles.card} activeOpacity={1}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
              <Text style={styles.navArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <TouchableOpacity onPress={nextMonth} disabled={atMax}
              style={[styles.navBtn, atMax && { opacity: 0.3 }]}>
              <Text style={styles.navArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={styles.row}>
            {DAYS.map(d => (
              <Text key={d} style={styles.dayHeader}>{d}</Text>
            ))}
          </View>

          {/* Grid */}
          {Array.from({ length: cells.length / 7 }, (_, w) => (
            <View key={w} style={styles.row}>
              {cells.slice(w * 7, w * 7 + 7).map((d, j) => {
                if (!d) return <View key={j} style={styles.cell} />;
                const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const isSel    = iso === selected;
                const isToday  = iso === today;
                const isFuture = iso > today;
                return (
                  <TouchableOpacity key={j} disabled={isFuture}
                    onPress={() => { onSelect(iso); onClose(); }}
                    style={[styles.cell, isSel && styles.selectedCell]}>
                    <Text style={[
                      styles.dayNum,
                      isSel    && styles.selectedNum,
                      isToday  && !isSel && styles.todayNum,
                      isFuture && styles.futureNum,
                    ]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 100 },
  card:         { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, width: 300, shadowColor: '#000', shadowOffset: {width:0,height:4}, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  navBtn:       { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.gray[100] },
  navArrow:     { fontSize: 18, color: colors.gray[600], fontWeight: '300' },
  monthLabel:   { fontSize: 14, fontWeight: '600', color: colors.gray[800] },
  row:          { flexDirection: 'row' },
  dayHeader:    { flex: 1, textAlign: 'center', fontSize: 10, color: colors.gray[400], fontWeight: '600', paddingVertical: 4 },
  cell:         { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.md },
  selectedCell: { backgroundColor: colors.brand[500] },
  dayNum:       { fontSize: 12, fontWeight: '500', color: colors.gray[700] },
  selectedNum:  { color: colors.white, fontWeight: '700' },
  todayNum:     { color: colors.brand[500], fontWeight: '700' },
  futureNum:    { color: colors.gray[200] },
});
