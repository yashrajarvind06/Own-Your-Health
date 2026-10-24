import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { absoluteUrl } from "@/lib/api";
import { colors, trustBadge } from "@/lib/theme";
import { Button, Group, Muted, Row, Segmented } from "./ui";
import { AiChip, AiDetailsView, StatusPill, flagged, type AiDetails } from "./AiSummary";

export type Record_ = {
  id: number;
  filename: string;
  record_type: string;
  record_date: string;
  one_line_summary: string;
  trust_badge: string;
  relevant: boolean;
  presigned_url: string | null;
  uploaded_by?: string;
  vitals?: Record<string, number | string | null> | null;
  mime_type?: string;
  user_summary?: string | null;
  ai_summary?: string | null;
  ai_details?: AiDetails | null;
  ai_status?: "PENDING" | "DONE" | "FAILED" | null;
};

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  "OPD Visit Notes": "medkit", Prescription: "document-text", "Lab Report": "flask", Imaging: "scan",
  "Procedure / Treatment Summary": "bandage", "Discharge Summary": "exit", Surgery: "cut", Allergy: "warning",
  "Follow-up Notes": "repeat", Other: "document",
};

// Five segments instead of ten chips; each groups related record types
type Filter = "all" | "labs" | "rx" | "visits" | "other";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" }, { key: "labs", label: "Labs" }, { key: "rx", label: "Rx" }, { key: "visits", label: "Visits" }, { key: "other", label: "Other" },
];
const GROUP_OF: Record<string, Filter> = {
  "Lab Report": "labs", Imaging: "labs", Prescription: "rx",
  "OPD Visit Notes": "visits", "Follow-up Notes": "visits", "Discharge Summary": "visits", "Procedure / Treatment Summary": "visits", Surgery: "visits",
};

const VITAL_LABEL: Record<string, [string, string]> = {
  bp_systolic: ["BP systolic", "mmHg"], bp_diastolic: ["BP diastolic", "mmHg"], glucose: ["Blood sugar", "mg/dL"],
  heart_rate: ["Pulse", "bpm"], weight: ["Weight", "kg"], temperature: ["Temperature", ""],
};

const month = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function Badge({ code }: { code: string }) {
  const b = trustBadge[code] ?? trustBadge.UNVERIFIED;
  return <Text style={[styles.badge, { color: b.color, backgroundColor: b.color + "14" }]}>{b.label}</Text>;
}

type Tab = "ai" | "original" | "details";
const TABS: { key: Tab; label: string }[] = [{ key: "ai", label: "AI Summary" }, { key: "original", label: "Original" }, { key: "details", label: "Details" }];
const longDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

function RecordSheet({ record, own, onClose, onDelete, onUpdated }: {
  record: Record_ | null; own: boolean; onClose: () => void; onDelete: (r: Record_) => void; onUpdated: (r: Record_) => void;
}) {
  const { request } = useSession();
  const [tab, setTab] = useState<Tab>("ai");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setTab("ai"); setError(null); }, [record?.id]);
  if (!record) return null;
  const vitals = Object.entries(record.vitals ?? {}).filter(([, v]) => v !== null && v !== undefined);
  const fileUrl = record.presigned_url ? absoluteUrl(record.presigned_url) : null;

  const rewrite = async () => {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await request<Record_>(`/reports/${record.id}/summarize`, { method: "POST", body: "{}" }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.sheetHead}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button"><Text style={styles.sheetLink}>Close</Text></Pressable>
          <Text style={styles.sheetTitle} numberOfLines={1}>{record.record_type}</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.headCard}>
          <View style={[styles.icon, { width: 44, height: 44, borderRadius: 12 }]}><Ionicons name={ICON[record.record_type] ?? "document"} size={22} color={colors.primary} /></View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.type}>{record.record_type}</Text>
            <Text style={styles.date}>{longDate(record.record_date)}</Text>
          </View>
          <Badge code={record.trust_badge} />
        </View>
        <Segmented options={TABS} value={tab} onChange={setTab} />
        <ScrollView contentContainerStyle={{ gap: 14, paddingTop: 12, paddingBottom: 34 }}>
          {tab === "ai" && (
            record.ai_status === "PENDING" || busy ? (
              <View style={styles.pending}><ActivityIndicator color={colors.ai} /><Text style={styles.pendingText}>Reading the document and writing a summary…</Text></View>
            ) : record.ai_details ? (
              <>
                <AiDetailsView details={record.ai_details} />
                {own && <Button label="Rewrite summary" kind="ghost" onPress={rewrite} />}
              </>
            ) : (
              <>
                <Group label="Summary">
                  <Row title={record.one_line_summary} last />
                </Group>
                {vitals.length > 0 && (
                  <Group label="Values read from the report" footer="Read automatically from the document and may contain errors.">
                    {vitals.map(([k, v], i) => (
                      <Row key={k} title={VITAL_LABEL[k]?.[0] ?? k} last={i === vitals.length - 1}
                        right={<Text style={styles.value}>{v} {VITAL_LABEL[k]?.[1] ?? ""}</Text>} />
                    ))}
                  </Group>
                )}
                {own && <Button label="Summarise with AI" icon={<Ionicons name="sparkles" size={18} color="#fff" />} onPress={rewrite} />}
              </>
            )
          )}
          {tab === "ai" && error && <Text style={{ color: colors.danger, textAlign: "center" }}>{error}</Text>}

          {tab === "original" && (
            <>
              {fileUrl && record.mime_type?.startsWith("image/") ? (
                <Image source={{ uri: fileUrl }} style={styles.preview} resizeMode="contain" accessibilityLabel={`Original ${record.record_type}`} />
              ) : (
                <View style={[styles.pending, { backgroundColor: colors.card }]}>
                  <Ionicons name="document-text-outline" size={40} color={colors.primary} />
                  <Text style={styles.pendingText}>{record.filename}</Text>
                </View>
              )}
              <Button label="Open full file" kind="ghost" disabled={!fileUrl} onPress={() => fileUrl && WebBrowser.openBrowserAsync(fileUrl)} />
            </>
          )}

          {tab === "details" && (
            <>
              <Group>
                <Row title="Date" right={<Text style={styles.value}>{longDate(record.record_date)}</Text>} />
                <Row title="Type" right={<Text style={styles.value}>{record.record_type}</Text>} />
                <Row title="Uploaded by" right={<Text style={styles.value}>{UPLOADER[record.uploaded_by ?? "PATIENT"] ?? record.uploaded_by}</Text>} />
                <Row title="File" subtitle={record.filename} last />
              </Group>
              {own && (
                <Group label="Actions">
                  <Row title="Share with a doctor…" left={<Ionicons name="share-outline" size={20} color={colors.primary} />}
                    onPress={() => { onClose(); router.push({ pathname: "/share", params: { select: String(record.id) } }); }} />
                  <Row title="Delete record" subtitle="You can restore it from Recently deleted" destructive last
                    left={<Ionicons name="trash-outline" size={20} color={colors.danger} />} onPress={() => onDelete(record)} />
                </Group>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const UPLOADER: Record<string, string> = { PATIENT: "You", DOCTOR: "Doctor", LAB: "Lab" };

/** Health timeline (docx): records by month, newest first; older, less relevant ones fade into their own group. */
export default function RecordTimeline({ patientId, header }: { patientId?: number; header?: ReactNode }) {
  const { request } = useSession();
  const [records, setRecords] = useState<Record_[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [showOld, setShowOld] = useState(false);
  const [open, setOpen] = useState<Record_ | null>(null);
  const [undo, setUndo] = useState<Record_ | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const own = !patientId;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await request<Record_[]>(`/reports/my${patientId ? `?patient_id=${patientId}` : ""}`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [request, patientId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Refresh quietly while the backend is still writing AI summaries
  const pending = records.filter((r) => r.ai_status === "PENDING").length;
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => request<Record_[]>(`/reports/my${patientId ? `?patient_id=${patientId}` : ""}`).then(setRecords).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [pending, request, patientId]);
  const updated = (r: Record_) => { setRecords((rs) => rs.map((x) => (x.id === r.id ? r : x))); setOpen(r); };
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  // Delete right away, then offer Undo (restore) instead of an "are you sure" step
  const remove = async (r: Record_) => {
    setOpen(null);
    setRecords((rs) => rs.filter((x) => x.id !== r.id));
    try {
      await request(`/reports/${r.id}`, { method: "DELETE" });
      setUndo(r);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), 6000);
    } catch (e: any) {
      setError(e.message);
      load();
    }
  };

  const restore = async () => {
    if (!undo) return;
    setUndo(null);
    await request(`/reports/${undo.id}/restore`, { method: "POST", body: "{}" }).catch((e) => setError(e.message));
    load();
  };

  const visible = filter === "all" ? records : records.filter((r) => (GROUP_OF[r.record_type] ?? "other") === filter);
  const months = useMemo(() => {
    const out: { label: string; items: Record_[] }[] = [];
    for (const r of visible.filter((x) => x.relevant)) {
      const m = month(r.record_date);
      const last = out[out.length - 1];
      if (last?.label === m) last.items.push(r);
      else out.push({ label: m, items: [r] });
    }
    return out;
  }, [visible]);
  const older = visible.filter((r) => !r.relevant);

  const row = (r: Record_, i: number, all: Record_[], faded = false) => (
    <Pressable key={r.id} onPress={() => setOpen(r)} accessibilityRole="button" accessibilityLabel={`${r.record_type}, ${day(r.record_date)}`}
      style={({ pressed }) => [styles.row, i < all.length - 1 && styles.rowLine, faded && { opacity: 0.6 }, pressed && { backgroundColor: "#f2f5fa" }]}>
      <View style={styles.icon}><Ionicons name={ICON[r.record_type] ?? "document"} size={18} color={colors.primary} /></View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.rowTop}>
          <Text style={styles.type} numberOfLines={1}>{r.record_type}</Text>
          <Text style={styles.date}>{day(r.record_date)}</Text>
        </View>
        {r.ai_status === "PENDING" ? (
          <Text style={[styles.summary, { color: colors.muted, fontStyle: "italic" }]}>Summarising…</Text>
        ) : (
          <Text style={styles.summary} numberOfLines={2}>{r.one_line_summary}</Text>
        )}
        {((r.ai_summary && !r.user_summary && r.ai_status !== "PENDING") || flagged(r.ai_details)) && (
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {r.ai_summary && !r.user_summary && r.ai_status !== "PENDING" && <AiChip />}
            {flagged(r.ai_details) && <StatusPill status={flagged(r.ai_details)!.status} />}
          </View>
        )}
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {header}
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        {pending > 0 && (
          <View style={styles.banner} accessibilityLiveRegion="polite">
            <Ionicons name="sparkles" size={20} color={colors.ai} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.bannerTitle}>Writing summaries for {pending} record{pending > 1 ? "s" : ""}…</Text>
              <Text style={styles.bannerSub}>You can keep browsing your records.</Text>
              <View style={styles.track}><View style={styles.bar} /></View>
            </View>
          </View>
        )}
        {error && <Text style={{ color: colors.danger }}>{error}</Text>}
        {!loading && visible.length === 0 && !error && (
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={56} color={colors.primary} />
            <Text style={styles.emptyTitle}>{records.length ? "Nothing in this category" : "No records yet"}</Text>
            <Muted>{own ? "Add a prescription, lab report or scan to start your health timeline." : "Records shared with you will appear here."}</Muted>
          </View>
        )}
        {months.map((m) => (
          <Group key={m.label} label={m.label}>{m.items.map((r, i) => row(r, i, m.items))}</Group>
        ))}
        {older.length > 0 && (
          <>
            <Pressable style={styles.olderToggle} onPress={() => setShowOld(!showOld)} accessibilityRole="button">
              <Ionicons name={showOld ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
              <Text style={styles.olderText}>{showOld ? "Hide" : "Show"} {older.length} older · less relevant</Text>
            </Pressable>
            {showOld && <Group>{older.map((r, i) => row(r, i, older, true))}</Group>}
          </>
        )}
      </ScrollView>

      {undo && (
        <View style={styles.toast} accessibilityLiveRegion="polite">
          <Text style={styles.toastText}>{undo.record_type} deleted</Text>
          <Pressable onPress={restore} hitSlop={10} accessibilityRole="button"><Text style={styles.toastAction}>Undo</Text></Pressable>
        </View>
      )}
      <RecordSheet record={open} own={own} onClose={() => setOpen(null)} onDelete={remove} onUpdated={updated} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 130, width: "100%", maxWidth: 900, alignSelf: "center" },
  row: { flexDirection: "row", gap: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.card },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#d5dbe5" },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  icon: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginTop: 2 },
  type: { fontWeight: "700", fontSize: 17, color: colors.text, flexShrink: 1 },
  date: { color: colors.muted, fontSize: 13 },
  summary: { color: colors.text, fontSize: 15, lineHeight: 20 },
  badge: { fontSize: 12, fontWeight: "600", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  empty: { alignItems: "center", gap: 8, paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  olderToggle: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", minHeight: 44 },
  olderText: { color: colors.muted, fontWeight: "600" },
  toast: { position: "absolute", left: 16, right: 16, bottom: 100, maxWidth: 480, alignSelf: "center", backgroundColor: "#1f2a44", borderRadius: 14, paddingHorizontal: 16, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toastText: { color: "#fff", fontWeight: "600" },
  toastAction: { color: "#8ab4f8", fontWeight: "800", fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.35)" },
  sheet: { height: "90%", backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 8, width: "100%", maxWidth: 560, alignSelf: "center" },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: "#cfd6e2", alignSelf: "center", marginBottom: 8 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginBottom: 6, gap: 8 },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text, flex: 1, textAlign: "center" },
  sheetLink: { color: colors.primary, fontSize: 17 },
  value: { fontSize: 17, fontWeight: "600", color: colors.text, flexShrink: 1, textAlign: "right" },
  headCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 16, padding: 12, marginBottom: 10 },
  pending: { alignItems: "center", gap: 10, padding: 28, borderRadius: 16, backgroundColor: colors.aiSoft },
  pendingText: { color: colors.text, fontSize: 15, textAlign: "center" },
  preview: { width: "100%", height: 420, borderRadius: 14, backgroundColor: colors.card },
  banner: { flexDirection: "row", gap: 12, backgroundColor: colors.aiSoft, borderRadius: 16, padding: 14 },
  bannerTitle: { color: colors.ai, fontWeight: "700", fontSize: 15 },
  bannerSub: { color: colors.text, fontSize: 13 },
  track: { height: 4, borderRadius: 2, backgroundColor: "#ddd3fb", overflow: "hidden" },
  bar: { width: "45%", height: 4, borderRadius: 2, backgroundColor: colors.ai },
});
