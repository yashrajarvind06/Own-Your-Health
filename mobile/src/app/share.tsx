import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { API_BASE } from "@/lib/api";
import { colors } from "@/lib/theme";
import { Button, Card, Chip, Heading, Muted, ui } from "@/components/ui";

type Rec = { id: number; record_type: string; record_date: string; one_line_summary: string };
type Link = { id: number; token: string; report_count: number; note: string | null; expires_at: string; view_count: number; last_viewed_at: string | null };

const DURATIONS = [{ key: "1h", label: "1 hour" }, { key: "1d", label: "1 day" }, { key: "7d", label: "7 days" }];
// The backend serves the app, so the share page lives on the same address as the API
const shareUrl = (token: string) => `${API_BASE}/s/${token}`;
const local = (iso: string) => new Date(iso + "Z").toLocaleString();

/** docx: give doctors access to chosen records via a secured link or QR, limited by time and number of reports. */
export default function ShareRecords() {
  const { patientId, select } = useLocalSearchParams<{ patientId?: string; select?: string }>();
  const q = patientId ? `?patient_id=${patientId}` : "";
  const { request } = useSession();
  const [records, setRecords] = useState<Rec[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [selected, setSelected] = useState<number[]>(select ? [Number(select)] : []); // preselected from a record's Share action
  const [duration, setDuration] = useState("1d");
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<Link | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    request<Rec[]>(`/reports/my${q}`).then(setRecords).catch(() => {});
    request<Link[]>(`/share-links${q}`).then(setLinks).catch(() => {});
  }, [request, q]);
  useFocusEffect(load);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const link = await request<Link>("/share-links", {
        method: "POST",
        body: JSON.stringify({ report_ids: selected, duration, note: note.trim() || null, patient_id: patientId ? Number(patientId) : null }),
      });
      setCreated(link);
      setSelected([]);
      setNote("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const send = (token: string) =>
    Share.share({ message: `My health records (view-only, expires automatically): ${shareUrl(token)}`, url: shareUrl(token) }).catch(() => {});

  const revoke = async (id: number) => {
    await request(`/share-links/${id}`, { method: "DELETE" });
    if (created?.id === id) setCreated(null);
    load();
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Stack.Screen options={{ title: "Share records" }} />
      {created && (
        <Card style={{ alignItems: "center", borderColor: colors.ok }}>
          <Text style={styles.title}>Link ready · {created.report_count} record{created.report_count > 1 ? "s" : ""}</Text>
          <Image source={{ uri: `${API_BASE}/share-links/qr?url=${encodeURIComponent(shareUrl(created.token))}` }} style={styles.qr}
            accessibilityLabel="QR code for the share link" />
          <Text selectable style={styles.url}>{shareUrl(created.token)}</Text>
          <Muted>Valid till {local(created.expires_at)}. Anyone with this link can view only these records.</Muted>
          <View style={ui.row}>
            <Button label="Send link" onPress={() => send(created.token)} icon={<Ionicons name="share-outline" size={18} color="#fff" />} />
            <Button label="Done" kind="ghost" onPress={() => setCreated(null)} />
          </View>
        </Card>
      )}

      <Heading>1. Choose records</Heading>
      {records.length === 0 && <Muted>No records to share yet.</Muted>}
      {records.map((r) => {
        const on = selected.includes(r.id);
        return (
          <Pressable key={r.id} style={styles.pick} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            onPress={() => setSelected(on ? selected.filter((x) => x !== r.id) : [...selected, r.id])}>
            <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.recTitle}>{r.record_type} · {new Date(r.record_date).toLocaleDateString()}</Text>
              <Muted>{r.one_line_summary}</Muted>
            </View>
          </Pressable>
        );
      })}

      <Heading>2. For how long?</Heading>
      <View style={ui.wrap}>{DURATIONS.map((d) => <Chip key={d.key} label={d.label} on={duration === d.key} onPress={() => setDuration(d.key)} />)}</View>
      <TextInput style={ui.input} value={note} onChangeText={setNote} maxLength={120}
        placeholder="Note for the doctor (optional), e.g. For Dr. Mehta, BP follow-up" accessibilityLabel="Note for the doctor" />
      {error && <Text style={ui.error}>{error}</Text>}
      <Button label={`Create link for ${selected.length} record${selected.length === 1 ? "" : "s"}`} onPress={create} busy={busy} disabled={selected.length === 0} />

      <Heading>Active links</Heading>
      {links.length === 0 && <Muted>No active links.</Muted>}
      {links.map((l) => (
        <Card key={l.id}>
          <Text style={styles.recTitle}>{l.report_count} record{l.report_count > 1 ? "s" : ""}{l.note ? ` · ${l.note}` : ""}</Text>
          <Muted>Expires {local(l.expires_at)} · viewed {l.view_count} time{l.view_count === 1 ? "" : "s"}{l.last_viewed_at ? `, last ${local(l.last_viewed_at)}` : ""}</Muted>
          <View style={[ui.row, { justifyContent: "flex-end" }]}>
            <Button label="Send" kind="ghost" onPress={() => send(l.token)} />
            <Button label="Revoke" kind="danger" onPress={() => revoke(l.id)} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  qr: { width: 220, height: 220 },
  url: { color: colors.primary, fontSize: 12, textAlign: "center" },
  pick: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  recTitle: { fontWeight: "600", color: colors.text },
});
