import { useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { Chip, Muted } from "@/components/ui";

type Msg = { from: "me" | "bot"; text: string; records?: { id: number; record_type: string; record_date: string; one_line_summary: string }[] };

const SUGGESTIONS = ["Show my last sugar report", "What medicines am I taking?", "What was my last BP?", "Who has access to my records?"];

/** docx: simple chatbot for record queries. Answers come only from the patient's own records. */
export default function Assistant() {
  const { patientId } = useLocalSearchParams<{ patientId?: string }>();
  const { request } = useSession();
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "bot", text: "Hi! Ask me about your own health records. I only look things up — I don't give medical advice." },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const ask = async (question: string) => {
    const qText = question.trim();
    if (!qText || busy) return;
    setText("");
    setMsgs((m) => [...m, { from: "me", text: qText }]);
    setBusy(true);
    try {
      const res = await request<{ answer: string; records: Msg["records"] }>("/reports/ask", {
        method: "POST",
        body: JSON.stringify({ question: qText, patient_id: patientId ? Number(patientId) : null }),
      });
      setMsgs((m) => [...m, { from: "bot", text: res.answer, records: res.records }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { from: "bot", text: `Sorry, I couldn't answer that (${e.message}).` }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: "Ask about my records" }} />
      <ScrollView ref={scroll} contentContainerStyle={styles.list}>
        {msgs.map((m, i) => (
          <View key={i} style={[styles.bubble, m.from === "me" ? styles.me : styles.bot]}>
            <Text style={{ color: m.from === "me" ? "#fff" : colors.text, lineHeight: 21 }}>{m.text}</Text>
            {m.records?.map((r) => (
              <View key={r.id} style={styles.rec}>
                <Text style={styles.recTitle}>{r.record_type} · {new Date(r.record_date).toLocaleDateString()}</Text>
                <Muted>{r.one_line_summary}</Muted>
              </View>
            ))}
          </View>
        ))}
        {busy && <Muted>Looking it up…</Muted>}
        {msgs.length === 1 && (
          <View style={styles.suggest}>{SUGGESTIONS.map((s) => <Chip key={s} label={s} on={false} onPress={() => ask(s)} />)}</View>
        )}
      </ScrollView>
      <View style={styles.bar}>
        <TextInput style={styles.input} value={text} onChangeText={setText} placeholder="e.g. Show my last sugar report"
          onSubmitEditing={() => ask(text)} returnKeyType="send" maxLength={300} accessibilityLabel="Your question" />
        <Pressable style={[styles.send, (!text.trim() || busy) && { opacity: 0.4 }]} onPress={() => ask(text)}
          disabled={!text.trim() || busy} accessibilityRole="button" accessibilityLabel="Send">
          <Ionicons name="send" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  bubble: { maxWidth: "88%", borderRadius: 16, padding: 12, gap: 8 },
  me: { alignSelf: "flex-end", backgroundColor: colors.primary },
  bot: { alignSelf: "flex-start", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  rec: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 },
  recTitle: { fontWeight: "600", color: colors.text },
  suggest: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bar: { flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  input: { flex: 1, backgroundColor: colors.bg, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, color: colors.text },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
