import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { api, today } from '../utils/api';
import { colors, spacing, radius } from '../utils/colors';
import DateNav from '../components/DateNav';

type Message = { id: string; role: 'user' | 'assistant'; content: string; nutritionLogged?: boolean };

function cleanReply(text: string) {
  return text
    .replace(/```(?:json)?\s*\[[\s\S]*?"log_nutrition"[\s\S]*?\]\s*```/g, '')
    .replace(/```(?:json)?\s*\{[\s\S]*?"log_nutrition"[\s\S]*?\}\s*```/g, '')
    .replace(/\[[\s\S]*?"log_nutrition"[\s\S]*?\]/g, '')
    .replace(/\{[^{}]*"log_nutrition"\s*:\s*true[^{}]*\}/g, '')
    .trim();
}

export default function ChatScreen() {
  const [date, setDate] = useState(today());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    api.get(`/api/chat/history?date=${date}`)
      .then(r => setMessages(r.data))
      .catch(() => setMessages([]));
  }, [date]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    try {
      const r = await api.post('/api/chat', { message: text, date });
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: r.data.message,
        nutritionLogged: r.data.nutrition_logged,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, { id: 'err', role: 'assistant', content: 'Something went wrong, please try again.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <DateNav date={date} onChange={setDate} />
        </View>

        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyText}>Ask anything about your health, or just tell me what you ate today.</Text>
            </View>
          )}
          {messages.map(msg => (
            <View key={msg.id} style={styles.msgWrapper}>
              <View style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
                {msg.role === 'user' ? (
                  <Text style={styles.userText}>{msg.content}</Text>
                ) : (
                  <Markdown style={mdStyles}>{cleanReply(msg.content)}</Markdown>
                )}
              </View>
              {msg.nutritionLogged && (
                <Text style={styles.loggedBadge}>✓ Logged in Nutrition</Text>
              )}
            </View>
          ))}
          {sending && (
            <View style={[styles.bubble, styles.assistantBubble]}>
              <ActivityIndicator size="small" color={colors.gray[400]} />
            </View>
          )}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask a question..."
            placeholderTextColor={colors.gray[400]}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity onPress={send} disabled={!input.trim() || sending}
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendDisabled]}>
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: colors.bg },
  header:          { paddingVertical: spacing.md, backgroundColor: colors.bg },
  scroll:          { flex: 1 },
  scrollContent:   { padding: spacing.lg, gap: spacing.md },
  emptyState:      { alignItems: 'center', marginTop: 60, gap: spacing.md },
  emptyIcon:       { fontSize: 40 },
  emptyText:       { fontSize: 14, color: colors.gray[400], textAlign: 'center', maxWidth: 260 },
  msgWrapper:      { gap: 4 },
  bubble:          { maxWidth: '80%', borderRadius: radius.lg, padding: spacing.md },
  userBubble:      { alignSelf: 'flex-end', backgroundColor: colors.brand[500], borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: colors.white, borderBottomLeftRadius: 4,
                     shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  userText:        { color: colors.white, fontSize: 14, lineHeight: 20 },
  loggedBadge:     { alignSelf: 'flex-start', fontSize: 11, color: colors.status.green, marginLeft: 4 },
  inputRow:        { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.sm,
                     backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.gray[200] },
  input:           { flex: 1, backgroundColor: colors.white, borderRadius: radius.xl, paddingHorizontal: spacing.md,
                     paddingVertical: spacing.sm, fontSize: 15, color: colors.gray[900], maxHeight: 100,
                     shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  sendBtn:         { backgroundColor: colors.brand[500], borderRadius: radius.xl, paddingHorizontal: spacing.lg,
                     paddingVertical: spacing.sm, justifyContent: 'center' },
  sendDisabled:    { opacity: 0.4 },
  sendText:        { color: colors.white, fontWeight: '600', fontSize: 15 },
});

const mdStyles: any = {
  body:          { color: colors.gray[900], fontSize: 14, lineHeight: 20 },
  strong:        { fontWeight: '700' },
  em:            { fontStyle: 'italic' },
  code_inline:   { backgroundColor: colors.gray[100], borderRadius: 4, paddingHorizontal: 4, fontSize: 12, fontFamily: 'monospace' },
  fence:         { backgroundColor: colors.gray[100], borderRadius: 8, padding: spacing.sm, marginVertical: spacing.xs },
  code_block:    { backgroundColor: colors.gray[100], borderRadius: 8, padding: spacing.sm, fontSize: 12, fontFamily: 'monospace' },
  table:         { borderWidth: 1, borderColor: colors.gray[200], borderRadius: 8, marginVertical: spacing.xs },
  th:            { backgroundColor: colors.gray[50], padding: spacing.xs, fontWeight: '700', fontSize: 12 },
  td:            { padding: spacing.xs, borderTopWidth: 1, borderTopColor: colors.gray[100], fontSize: 13 },
  paragraph:     { marginVertical: 2 },
};
