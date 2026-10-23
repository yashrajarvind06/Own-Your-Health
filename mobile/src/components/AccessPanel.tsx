import { useCallback, useState, type ReactNode } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { colors, purposeLabel } from "@/lib/theme";
import AlertsCard from "./AlertsCard";
import HistoryList from "./HistoryList";
import { Group, Muted, Row, Segmented, ui } from "./ui";

type Trust = { score: number; rating_avg: number | null; rating_count: number; hospital: string | null };
type Pending = { id: number; doctor_name: string | null; access_reason: string | null; reason_note: string | null; created_at: string; doctor_trust?: Trust };
type Active = { doctor_id: number; doctor_name: string; remaining_seconds: number; revocable: boolean };
type Report = { id: number; record_type: string; record_date: string; one_line_summary: string };

// Must match AccessService._get_duration_delta on the backend
const DURATIONS = [
  { key: "15m", label: "15 min" }, { key: "1h", label: "1 hour" }, { key: "1d", label: "1 day" }, { key: "7d", label: "7 days" },
] as const;
type Duration = (typeof DURATIONS)[number]["key"];
type Tab = "requests" | "active" | "history";

const remaining = (s: number) => (s >= 86400 ? `${Math.floor(s / 86400)} d` : s >= 3600 ? `${Math.floor(s / 3600)} h` : `${Math.max(1, Math.floor(s / 60))} min`);
const initials = (n: string | null) => (n ?? "Dr").replace(/^Dr\.?\s*/, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** Consent inbox. patientId = a caregiver acting for a family member (no History tab then). */
export default function AccessPanel({ patientId, header }: { patientId?: number; header?: ReactNode }) {
  const { request } = useSession();
  const q = patientId ? `?patient_id=${patientId}` : "";
  const [tab, setTab] = useState<Tab>("requests");
  const [pending, setPending] = useState<Pending[]>([]);
  const [active, setActive] = useState<Active[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<Pending | null>(null);
  const [duration, setDuration] = useState<Duration>("1h");
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, a, r] = await Promise.all([
        request<Pending[]>(`/access/requests/pending${q}`),
        request<Active[]>(`/access/patient/active${q}`),
        request<Report[]>(`/reports/my${q}`).catch(() => [] as Report[]), // a delegate may lack VIEW_RECORDS
      ]);
      setPending(p);
      setActive(a);
      setReports(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [request, q]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setReviewing(null);
      setConfirmRevoke(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const approve = () => reviewing && act(async () => {
    const res = await request<{ session_id: number }>("/access/approve", { method: "POST", body: JSON.stringify({ request_id: reviewing.id, duration }) });
    if (selected.length) {
      await request("/access/reports/grant", { method: "POST", body: JSON.stringify({ session_id: res.session_id, report_ids: selected, duration }) });
    }
  });
  const deny = (id: number) => act(() => request(`/access/deny?request_id=${id}`, { method: "POST", body: "{}" }));
  const revoke = (doctorId: number) =>
    act(() => request("/access/revoke", { method: "POST", body: JSON.stringify({ doctor_id: doctorId, patient_id: patientId, reason: "Revoked by patient" }) }));

  const tabs: { key: Tab; label: string }[] = [
    { key: "requests", label: pending.length ? `Requests (${pending.length})` : "Requests" },
    { key: "active", label: "Who has access" },
    ...(patientId ? [] : [{ key: "history" as Tab, label: "History" }]),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={[ui.content, { maxWidth: 900 }]} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {header}
        <AlertsCard patientId={patientId} />
        <Segmented options={tabs} value={tab} onChange={setTab} />
        {error && <Text style={ui.error}>{error}</Text>}

        {tab === "requests" && (pending.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={52} color={colors.ok} />
            <Text style={styles.emptyTitle}>You're all caught up</Text>
            <Muted>When a doctor scans your QR or you invite one, their request appears here.</Muted>
          </View>
        ) : pending.map((p) => (
          <View key={p.id} style={styles.card}>
            <View style={styles.head}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initials(p.doctor_name)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.doctor_name ?? "A doctor"}</Text>
                {p.doctor_trust?.hospital && <Muted>{p.doctor_trust.hospital}</Muted>}
              </View>
              {p.doctor_trust && <Text style={styles.trust}>Trust {p.doctor_trust.score}</Text>}
            </View>
            <Text style={styles.purpose}><Text style={{ fontWeight: "700" }}>Purpose: </Text>{purposeLabel[p.access_reason ?? ""] ?? p.access_reason ?? "Not given"}</Text>
            {p.reason_note ? <Text style={styles.note}>“{p.reason_note}”</Text> : null}
            <View style={styles.btns}>
              <Pressable style={[styles.btn, styles.btnPlain]} onPress={() => deny(p.id)} disabled={busy} accessibilityRole="button">
                <Text style={styles.btnPlainText}>Deny</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnPrimary]} disabled={busy} accessibilityRole="button"
                onPress={() => { setReviewing(p); setDuration("1h"); setSelected([]); }}>
                <Text style={styles.btnPrimaryText}>Review…</Text>
              </Pressable>
            </View>
          </View>
        )))}

        {tab === "active" && (
          <Group footer="Access ends on its own when the time runs out. Revoking stops it immediately.">
            {active.length === 0 ? <Row title="Nobody has access to your records" last /> : active.map((a, i) => (
              <Row key={a.doctor_id} title={a.doctor_name} subtitle={`Ends in ${remaining(a.remaining_seconds)}`} last={i === active.length - 1}
                left={<View style={[styles.avatar, { width: 36, height: 36 }]}><Text style={styles.avatarText}>{initials(a.doctor_name)}</Text></View>}
                right={!a.revocable ? null : confirmRevoke === a.doctor_id ? (
                  <View style={styles.confirm}>
                    <Pressable onPress={() => setConfirmRevoke(null)} style={styles.confirmBtn} accessibilityRole="button"><Text style={{ color: colors.muted, fontWeight: "600" }}>Cancel</Text></Pressable>
                    <Pressable onPress={() => revoke(a.doctor_id)} style={styles.confirmBtn} accessibilityRole="button"><Text style={{ color: colors.danger, fontWeight: "700" }}>Revoke</Text></Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => setConfirmRevoke(a.doctor_id)} style={styles.confirmBtn} accessibilityRole="button" accessibilityLabel={`Revoke ${a.doctor_name}`}>
                    <Text style={{ color: colors.danger, fontWeight: "600" }}>Revoke</Text>
                  </Pressable>
                )} />
            ))}
          </Group>
        )}

        {tab === "history" && <HistoryList />}
      </ScrollView>

      <Modal visible={!!reviewing} transparent animationType="slide" onRequestClose={() => setReviewing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setReviewing(null)} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.sheetHead}>
            <Pressable onPress={() => setReviewing(null)} hitSlop={10} accessibilityRole="button"><Text style={styles.sheetLink}>Cancel</Text></Pressable>
            <Text style={styles.sheetTitle}>Allow access</Text>
            <Pressable onPress={approve} disabled={busy} hitSlop={10} accessibilityRole="button"><Text style={[styles.sheetLink, { fontWeight: "700" }]}>Allow</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 30 }}>
            <Muted>{reviewing?.doctor_name ?? "The doctor"} will see only the records you tick, until the time runs out.</Muted>
            <Text style={styles.label}>For how long?</Text>
            <Segmented options={[...DURATIONS]} value={duration} onChange={setDuration} />
            <Group label="Share which records?" footer={selected.length ? `${selected.length} selected` : "None selected: the doctor sees your profile only."}>
              {reports.length === 0 ? <Row title="You have no records to share" last /> : reports.map((r, i) => {
                const on = selected.includes(r.id);
                return (
                  <Row key={r.id} title={r.record_type} subtitle={r.one_line_summary} last={i === reports.length - 1}
                    onPress={() => setSelected(on ? selected.filter((x) => x !== r.id) : [...selected, r.id])}
                    right={<Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={24} color={on ? colors.primary : "#b6bfcc"} />} />
                );
              })}
            </Group>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 8, shadowColor: "#1f2a44", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontWeight: "700" },
  name: { fontSize: 17, fontWeight: "700", color: colors.text },
  trust: { color: colors.ok, backgroundColor: "#e6f4ea", fontWeight: "700", fontSize: 13, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  purpose: { fontSize: 15, color: colors.text },
  note: { color: colors.muted, fontSize: 15 },
  btns: { flexDirection: "row", gap: 10, marginTop: 4 },
  btn: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnPlain: { backgroundColor: "#eef2f8" },
  btnPlainText: { color: colors.text, fontWeight: "700", fontSize: 16 },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  confirm: { flexDirection: "row" },
  confirmBtn: { minHeight: 44, paddingHorizontal: 8, justifyContent: "center" },
  empty: { alignItems: "center", gap: 8, paddingTop: 50, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  label: { fontWeight: "700", color: colors.text, fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.35)" },
  sheet: { maxHeight: "88%", backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 8, width: "100%", maxWidth: 560, alignSelf: "center" },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: "#cfd6e2", alignSelf: "center", marginBottom: 8 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginBottom: 6 },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  sheetLink: { color: colors.primary, fontSize: 17 },
});
