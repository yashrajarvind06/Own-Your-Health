import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { colors, purposeLabel } from "@/lib/theme";
import { Group, Muted, Row } from "./ui";

type Entry = {
  session_id: number; doctor_name: string; access_type: string; reason: string;
  start_time: string; end_time: string; status: string; reports: { report_id: number; report_name: string; accessed: boolean }[];
};
type FamilyLog = { id: number; details: string; created_at: string };
type MyDoctor = { id: number; name: string; my_rating: number | null; trust: { score: number; rating_avg: number | null; rating_count: number } };

const STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "Active", color: colors.ok }, EXPIRED: { label: "Ended", color: colors.muted }, REVOKED: { label: "Revoked", color: colors.danger },
};
const when = (iso: string) => new Date(iso.endsWith("Z") ? iso : iso + "Z").toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** docx: patients see who accessed their records (doctors and family), and rate the doctors they saw. */
export default function HistoryList() {
  const { request } = useSession();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [family, setFamily] = useState<FamilyLog[]>([]);
  const [doctors, setDoctors] = useState<MyDoctor[]>([]);

  const load = useCallback(async () => {
    const [h, f, d] = await Promise.all([
      request<Entry[]>("/patient/access/history").catch(() => []),
      request<FamilyLog[]>("/family/activity").catch(() => []),
      request<MyDoctor[]>("/doctors/mine").catch(() => []),
    ]);
    setEntries(h);
    setFamily(f);
    setDoctors(d);
  }, [request]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rate = (id: number, n: number) =>
    request(`/doctors/${id}/feedback`, { method: "POST", body: JSON.stringify({ rating: n }) }).then(load).catch(() => {});

  return (
    <View style={{ gap: 6 }}>
      {doctors.length > 0 && (
        <Group label="Rate your doctors" footer="Ratings feed each doctor's trust score, which other patients see.">
          {doctors.map((d, i) => (
            <Row key={d.id} title={d.name} last={i === doctors.length - 1}
              subtitle={`Trust ${d.trust.score}/100${d.trust.rating_avg ? ` · ★${d.trust.rating_avg} from ${d.trust.rating_count}` : ""}`}
              right={
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable key={n} onPress={() => rate(d.id, n)} style={styles.star} accessibilityRole="button"
                      accessibilityLabel={`Rate ${d.name} ${n} star${n > 1 ? "s" : ""}`}>
                      <Ionicons name={(d.my_rating ?? 0) >= n ? "star" : "star-outline"} size={22} color="#b8860b" />
                    </Pressable>
                  ))}
                </View>
              } />
          ))}
        </Group>
      )}

      <Group label="Doctors">
        {entries.length === 0 ? <Row title="No doctor has accessed your records yet" last /> : entries.map((e, i) => {
          const s = STATUS[e.status] ?? { label: e.status, color: colors.muted };
          const opened = e.reports.filter((r) => r.accessed).map((r) => r.report_name);
          return (
            <Row key={`${e.access_type}-${e.session_id}`} title={e.doctor_name} last={i === entries.length - 1}
              subtitle={`${purposeLabel[e.reason] ?? e.reason} · ${e.access_type === "EMERGENCY" ? "Emergency override" : "With your consent"}\n${when(e.start_time)} → ${when(e.end_time)}${opened.length ? `\nOpened: ${opened.join(", ")}` : ""}`}
              right={<Text style={[styles.status, { color: s.color }]}>{s.label}</Text>} />
          );
        })}
      </Group>

      <Group label="Family members">
        {family.length === 0 ? <Row title="No family activity" last /> : family.map((l, i) => (
          <Row key={l.id} title={l.details.replace(/^Action: family_/, "").replace(/_/g, " ").split(",")[0]}
            subtitle={`${l.details.match(/Delegate: ([^,]+)/)?.[1] ?? ""} · ${when(l.created_at)}`} last={i === family.length - 1} />
        ))}
      </Group>
      <Muted>Every view is recorded. Unusual access raises an alert on your Home screen.</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: "row" },
  star: { width: 32, height: 44, alignItems: "center", justifyContent: "center" },
  status: { fontWeight: "600", fontSize: 15 },
});
