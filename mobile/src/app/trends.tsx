import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { Card, Muted, ui } from "@/components/ui";

type Row = { date: string; bp_systolic: number | null; bp_diastolic: number | null; heart_rate: number | null; glucose: number | null; weight: number | null; temperature: string | null };

// docx: support 4-5 common vitals only
const VITALS: { key: keyof Row; label: string; unit: string; high?: number }[] = [
  { key: "bp_systolic", label: "Blood pressure (systolic)", unit: "mmHg", high: 140 },
  { key: "glucose", label: "Blood sugar", unit: "mg/dL", high: 140 },
  { key: "weight", label: "Weight", unit: "kg" },
  { key: "heart_rate", label: "Heart rate", unit: "bpm", high: 100 },
  { key: "temperature", label: "Temperature", unit: "" },
];

/** Simple bar view per vital over time, from values read off uploaded reports. */
export default function Trends() {
  const { request } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    request<{ id: number }>("/user/me/profile")
      .then((me) => request<Row[]>(`/reports/trends/${me.id}`))
      .then(setRows).catch(() => {}).finally(() => setLoaded(true));
  }, [request]);

  const series = VITALS.map((v) => ({ ...v, points: rows.filter((r) => r[v.key] != null).map((r) => ({ date: r.date, value: Number(r[v.key]), bp: r.bp_diastolic })) }))
    .filter((s) => s.points.length > 0);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Stack.Screen options={{ title: "Health trends" }} />
      {loaded && series.length === 0 && <Muted>No values found yet. Trends appear when uploaded reports contain BP, sugar, weight, heart rate or temperature.</Muted>}
      {series.map((s) => {
        const max = Math.max(...s.points.map((p) => p.value));
        return (
          <Card key={s.key}>
            <Text style={styles.title}>{s.label}</Text>
            {s.points.map((p) => (
              <View key={p.date + p.value} style={styles.bar}>
                <Text style={styles.date}>{p.date}</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(8, (p.value / max) * 100)}%`, backgroundColor: s.high && p.value >= s.high ? colors.danger : colors.primary }]} />
                </View>
                <Text style={styles.value}>{s.key === "bp_systolic" && p.bp ? `${p.value}/${p.bp}` : p.value} {s.unit}</Text>
              </View>
            ))}
          </Card>
        );
      })}
      <Muted>Values are read automatically from your reports and may contain errors. Not medical advice.</Muted>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  bar: { flexDirection: "row", alignItems: "center", gap: 8 },
  date: { width: 84, color: colors.muted, fontSize: 12 },
  track: { flex: 1, height: 10, backgroundColor: colors.primarySoft, borderRadius: 5, overflow: "hidden" },
  fill: { height: 10, borderRadius: 5 },
  value: { width: 92, textAlign: "right", color: colors.text, fontSize: 13 },
});
