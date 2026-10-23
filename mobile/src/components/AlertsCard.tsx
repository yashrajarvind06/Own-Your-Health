import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

type Alert = { id: number; message: string; created_at: string; seen: boolean };

/** docx misuse alerts: the patient is told, access is not blocked. Shows unseen alerts; "Got it" dismisses. */
export default function AlertsCard({ patientId }: { patientId?: number }) {
  const { request } = useSession();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const q = patientId ? `?patient_id=${patientId}` : "";

  useFocusEffect(useCallback(() => {
    request<Alert[]>(`/alerts${q}`).then((a) => setAlerts(a.filter((x) => !x.seen))).catch(() => {});
  }, [request, q]));

  const dismiss = async (id: number) => {
    setAlerts((a) => a.filter((x) => x.id !== id));
    await request(`/alerts/${id}/seen`, { method: "POST", body: "{}" }).catch(() => {});
  };

  if (alerts.length === 0) return null;
  return (
    <View style={styles.card} accessibilityRole="alert">
      <View style={styles.row}>
        <Ionicons name="warning" size={20} color={colors.danger} />
        <Text style={styles.title}>Unusual access detected</Text>
      </View>
      {alerts.map((a) => (
        <View key={a.id} style={styles.item}>
          <Text style={styles.msg}>{a.message.replace(/^Unusual access detected: /, "")}</Text>
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <Text style={styles.time}>{new Date(a.created_at + "Z").toLocaleString()}</Text>
            <Pressable onPress={() => dismiss(a.id)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.ok}>Got it</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Text style={styles.hint}>Access was not blocked. If this wasn't expected, revoke the doctor from the Access tab.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fdecea", borderColor: colors.danger, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontWeight: "700", color: colors.danger, fontSize: 16 },
  item: { gap: 4, borderTopWidth: 1, borderTopColor: "#f5c6c0", paddingTop: 8 },
  msg: { color: colors.text, lineHeight: 20 },
  time: { color: colors.muted, fontSize: 12 },
  ok: { color: colors.primary, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: 12 },
});
