import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { Card, Muted } from "./ui";

export type Summary = {
  name: string | null;
  age: number | null;
  blood_group: string | null;
  abha_number: string | null;
  chronic_conditions: string[];
  current_medications: string[];
  allergies: string[];
  recent_tests: { id: number; date: string; summary: string }[];
  latest_vitals: string[];
  last_visit: { date: string; days_ago: number; type: string } | null;
  total_records: number;
  verified_record_count: number;
  overview: string;
};

/** docx "Patient Snapshot": the whole profile in a glance. */
export default function SummaryCard({ patientId }: { patientId?: number }) {
  const { request } = useSession();
  const [s, setS] = useState<Summary | null>(null);

  useFocusEffect(
    useCallback(() => {
      request<Summary>(`/reports/summary${patientId ? `?patient_id=${patientId}` : ""}`).then(setS).catch(() => setS(null));
    }, [request, patientId]),
  );

  if (!s) return null;
  return (
    <Card>
      <Text style={styles.title}>Health snapshot</Text>
      <Text style={styles.overview}>{s.overview}</Text>
      <Row label="Blood group" value={s.blood_group} />
      <Row label="Conditions" value={s.chronic_conditions.join(", ")} />
      <Row label="Medications" value={s.current_medications.join(", ")} />
      <Row label="Allergies" value={s.allergies.join(", ")} highlight />
      <Row label="Latest values" value={s.latest_vitals.join(", ")} />
      <Row label="Last visit" value={s.last_visit ? `${s.last_visit.days_ago} days ago (${s.last_visit.type})` : null} />
      {s.recent_tests.length > 0 && (
        <View style={{ gap: 2 }}>
          <Text style={styles.label}>Recent tests</Text>
          {s.recent_tests.map((t) => <Muted key={t.id}>• {t.date}: {t.summary}</Muted>)}
        </View>
      )}
      <Muted>{s.total_records} records · {s.verified_record_count} verified</Muted>
    </Card>
  );
}

function Row({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, highlight && { color: colors.danger }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  overview: { color: colors.text, lineHeight: 21 },
  row: { flexDirection: "row", gap: 8 },
  label: { width: 105, color: colors.muted, fontWeight: "600" },
  value: { flex: 1, color: colors.text },
});
