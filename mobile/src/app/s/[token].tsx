import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { api, absoluteUrl } from "@/lib/api";
import { colors, trustBadge } from "@/lib/theme";
import { Card, Muted, ui } from "@/components/ui";

type Shared = {
  patient_name: string | null; abha_verified: boolean; note: string | null; expires_at: string;
  records: { id: number; record_type: string; record_date: string; one_line_summary: string; trust_badge: string; presigned_url: string | null }[];
};

/** Public page a doctor opens from a patient's share link. No login: the link is the credential. */
export default function SharedRecords() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [data, setData] = useState<Shared | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Shared>(`/share-links/view/${token}`, null).then(setData).catch((e) => setError(e.message));
  }, [token]);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Stack.Screen options={{ title: "Shared health records" }} />
      {error && (
        <Card><View style={ui.row}><Ionicons name="lock-closed" size={20} color={colors.danger} /><Text style={{ color: colors.text, flex: 1 }}>{error}</Text></View></Card>
      )}
      {data && (
        <>
          <Card>
            <Text style={styles.name}>{data.patient_name ?? "Patient"}{data.abha_verified ? "  ✓ ABHA verified" : ""}</Text>
            {data.note && <Text style={{ color: colors.text }}>“{data.note}”</Text>}
            <Muted>Shared by the patient · view-only · expires {new Date(data.expires_at + "Z").toLocaleString()}</Muted>
            <Muted>Each view is logged and visible to the patient.</Muted>
          </Card>
          {data.records.map((r) => {
            const badge = trustBadge[r.trust_badge] ?? trustBadge.UNVERIFIED;
            return (
              <Pressable key={r.id} accessibilityRole="button" onPress={() => r.presigned_url && WebBrowser.openBrowserAsync(absoluteUrl(r.presigned_url))}>
                <Card>
                  <View style={styles.top}>
                    <Text style={styles.type}>{r.record_type}</Text>
                    <Text style={{ color: colors.muted }}>{new Date(r.record_date).toLocaleDateString()}</Text>
                  </View>
                  <Text style={{ color: colors.text }}>{r.one_line_summary}</Text>
                  <View style={styles.top}>
                    <Text style={[styles.badge, { color: badge.color, borderColor: badge.color }]}>{badge.label}</Text>
                    <Text style={{ color: colors.primary, fontWeight: "600" }}>Open ›</Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 18, fontWeight: "700", color: colors.text },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  type: { fontWeight: "700", color: colors.text },
  badge: { fontSize: 12, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
