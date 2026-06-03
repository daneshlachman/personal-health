import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../utils/api';
import { colors, card, spacing, radius } from '../utils/colors';

function SettingRow({ label, value, onPress, destructive }: {
  label: string; value?: string; onPress: () => void; destructive?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={rowStyles.row}>
      <Text style={[rowStyles.label, destructive && { color: colors.status.red }]}>{label}</Text>
      {value && <Text style={rowStyles.value}>{value}</Text>}
      {!destructive && <Text style={rowStyles.chevron}>›</Text>}
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  label:   { flex: 1, fontSize: 15, color: colors.gray[900] },
  value:   { fontSize: 14, color: colors.gray[400], marginRight: spacing.sm },
  chevron: { fontSize: 18, color: colors.gray[300] },
});

export default function SettingsScreen({ navigation }: any) {
  const [whoopConnected, setWhoopConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/whoop/status').then(r => setWhoopConnected(r.data.connected)).catch(() => {});
  }, []);

  const syncWhoop = () => {
    setSyncing('whoop');
    api.post('/api/sync/whoop')
      .then(() => Alert.alert('Done', 'Whoop synced successfully.'))
      .catch(() => Alert.alert('Error', 'Sync failed.'))
      .finally(() => setSyncing(null));
  };

  const syncGarmin = () => {
    setSyncing('garmin');
    api.post('/api/sync/garmin')
      .then(() => Alert.alert('Done', 'Garmin synced successfully.'))
      .catch(() => Alert.alert('Error', 'Sync failed.'))
      .finally(() => setSyncing(null));
  };

  const syncHevy = () => {
    setSyncing('hevy');
    api.post('/api/sync/hevy')
      .then(() => Alert.alert('Done', 'Hevy synced successfully.'))
      .catch(() => Alert.alert('Error', 'Sync failed.'))
      .finally(() => setSyncing(null));
  };

  const disconnectWhoop = () => {
    Alert.alert('Disconnect Whoop', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => {
        api.post('/api/whoop/disconnect').then(() => setWhoopConnected(false)).catch(console.error);
      }},
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Sync */}
        <View style={[card, styles.section]}>
          <Text style={styles.sectionTitle}>SYNC</Text>
          <SettingRow
            label={syncing === 'whoop' ? 'Syncing Whoop…' : 'Sync Whoop'}
            value={whoopConnected === true ? 'Connected' : whoopConnected === false ? 'Not connected' : ''}
            onPress={whoopConnected ? syncWhoop : () => {}}
          />
          <SettingRow
            label={syncing === 'garmin' ? 'Syncing Garmin…' : 'Sync Garmin'}
            onPress={syncGarmin}
          />
          <SettingRow
            label={syncing === 'hevy' ? 'Syncing Hevy…' : 'Sync Hevy'}
            onPress={syncHevy}
          />
        </View>

        {/* Whoop */}
        {whoopConnected && (
          <View style={[card, styles.section]}>
            <Text style={styles.sectionTitle}>WHOOP</Text>
            <SettingRow label="Disconnect Whoop" onPress={disconnectWhoop} destructive />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.bg },
  content:      { padding: spacing.lg, gap: spacing.md, paddingBottom: 32 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  backBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  backArrow:    { fontSize: 18, color: colors.gray[600] },
  title:        { fontSize: 22, fontWeight: '700', color: colors.gray[900] },
  section:      { padding: 0, overflow: 'hidden' },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.gray[400], letterSpacing: 0.8, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
});
