import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { AiChip } from "@/components/AiSummary";
import { Button, Group, Muted, Row, ui } from "@/components/ui";

type Cited = { name: string; detail: string; report_ids: number[] };
type History = {
  overview: string; conditions: Cited[]; medications: Cited[]; allergies: string[];
  trends: { name: string; change: string; direction: "rising" | "falling" | "stable"; report_ids: number[] }[];
  events: { date: string; title: string; detail?: string; report_ids: number[] }[];
  source: "AI" | "RULES"; report_count: number; generated_at: string; stale: boolean;
};
type Payload = { ai_enabled: boolean; report_count: number; history: History | null; shared_with: { doctor_id: number; doctor_name: string }[] };
type Doctor = { doctor_id: number; doctor_name: string; active: boolean; remaining_seconds: number; last_seen: string | null };

const STEPS = ["Reading your medical reports", "Finding conditions and medicines", "Looking at trends and changes", "Writing your summary", "Almost ready"];
const TREND = { rising: { label: "Rising", color: colors.danger }, falling: { label: "Falling", color: colors.warn }, stable: { label: "Stable", color: colors.ok } };
const cites = (ids: number[]) => (ids.length ? `${ids.length} report${ids.length > 1 ? "s" : ""}` : "");
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Full-screen "analysing" moment: a breathing icon and a checklist that advances while the request runs. */
function Analysing({ visible, done, reportCount, ai }: { visible: boolean; done: boolean; reportCount: number; ai: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!visible) return;
    setStep(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1600);
    return () => { loop.stop(); clearInterval(t); };
  }, [visible, pulse]);
  const current = done ? STEPS.length : step;
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const halo = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay} accessibilityViewIsModal accessibilityLiveRegion="polite">
        <View style={styles.analyse}>
          <View style={styles.orbWrap}>
            <Animated.View style={[styles.halo, { opacity: halo, transform: [{ scale }] }]} />
            <Animated.View style={[styles.orb, { transform: [{ scale }] }]}>
              <Ionicons name="document-text" size={40} color={colors.ai} />
              <Ionicons name="sparkles" size={18} color={colors.ai} style={{ position: "absolute", right: 26, bottom: 28 }} />
            </Animated.View>
          </View>
          <Text style={styles.analyseTitle}>Analysing your medical reports…</Text>
          <Text style={styles.analyseSub}>Reading {reportCount} report{reportCount === 1 ? "" : "s"} to write your health history.</Text>
          <View style={{ gap: 14, alignSelf: "stretch", marginTop: 6 }}>
            {STEPS.map((s, i) => (
              <View key={s} style={styles.step}>
                {i < current ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  : i === current ? <ActivityIndicator size="small" color={colors.primary} style={{ width: 22 }} />
                  : <Ionicons name="ellipse-outline" size={22} color="#b8c2d3" />}
                <Text style={[styles.stepText, i > current && { color: colors.muted }]}>{s}</Text>
              </View>
            ))}
          </View>
          {ai && (
            <View style={styles.privacy}>
              <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
              <Text style={styles.privacyText}>Your reports are sent to Google Gemini only to write this summary. It is saved in your account, not shared until you choose.</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function HealthHistory() {
  const { request } = useSession();
  const [data, setData] = useState<Payload | null>(null);
  const [generating, setGenerating] = useState(false);
  const [finished, setFinished] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => { request<Payload>("/health-summary").then(setData).catch((e) => setError(e.message)); }, [request]);
  useFocusEffect(load);

  const generate = async () => {
    setError(null);
    setFinished(false);
    setGenerating(true);
    try {
      const res = await request<Payload>("/health-summary/generate", { method: "POST", body: "{}" });
      setFinished(true);
      await new Promise((r) => setTimeout(r, 600)); // let the last tick show
      setData(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const openShare = async () => {
    setShareOpen(true);
    setDoctors(await request<Doctor[]>("/health-summary/doctors").catch(() => []));
  };

  const toggleShare = async (d: Doctor, shared: boolean) => {
    try {
      setData(await request<Payload>(shared ? `/health-summary/share/${d.doctor_id}` : "/health-summary/share",
        shared ? { method: "DELETE" } : { method: "POST", body: JSON.stringify({ doctor_id: d.doctor_id }) }));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const h = data?.history;
  const sharedIds = new Set(data?.shared_with.map((s) => s.doctor_id));

  return (
    <>
      <ScrollView style={ui.screen} contentContainerStyle={[ui.content, { maxWidth: 760 }]}>
        <Stack.Screen options={{
          title: "Health history",
          headerRight: () => h ? (
            <Pressable onPress={generate} hitSlop={10} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
              <Text style={{ color: colors.primary, fontSize: 17 }}>Regenerate</Text>
            </Pressable>
          ) : null,
        }} />
        {!data && !error && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}
        {error && <Text style={ui.error}>{error}</Text>}

        {data && !h && (
          <View style={styles.card}>
            <View style={styles.genIcon}><Ionicons name="sparkles" size={26} color={colors.ai} /></View>
            <Text style={styles.cardTitle}>Create your health history</Text>
            <Text style={styles.body}>
              {data.ai_enabled
                ? "AI reads your reports and writes a short history of your conditions, medicines, allergies and changes, so a new doctor can catch up in a minute."
                : "We'll put together your conditions, medicines, allergies and recent tests from your records."}
            </Text>
            <Button label="Generate summary" icon={<Ionicons name="sparkles" size={18} color="#fff" />} onPress={generate} disabled={!data.report_count} />
            <Muted>{data.report_count ? `Based on ${data.report_count} report${data.report_count > 1 ? "s" : ""} · takes a few seconds` : "Add a record first to create your history."}</Muted>
          </View>
        )}

        {h && (
          <>
            {h.stale && (
              <Pressable style={styles.stale} onPress={generate} accessibilityRole="button">
                <Ionicons name="refresh" size={18} color={colors.ai} />
                <Text style={styles.staleText}>You have new reports since this was written. Tap to update.</Text>
              </Pressable>
            )}
            <View style={styles.card}>
              {h.source === "AI" ? <AiChip /> : <Text style={styles.basic}>Basic summary</Text>}
              <Text style={styles.body}>{h.overview}</Text>
              <Muted>From {h.report_count} reports · {shortDate(h.generated_at)} · Not a diagnosis</Muted>
            </View>

            {h.allergies.length > 0 && (
              <Group label="Allergies">
                {h.allergies.map((a, i) => (
                  <Row key={a} title={a} last={i === h.allergies.length - 1} left={<Ionicons name="warning" size={20} color={colors.danger} />} />
                ))}
              </Group>
            )}
            {h.conditions.length > 0 && (
              <Group label="Conditions">
                {h.conditions.map((c, i) => (
                  <Row key={c.name} title={c.name} subtitle={c.detail || null} last={i === h.conditions.length - 1}
                    right={<Text style={styles.cite}>{cites(c.report_ids)}</Text>} />
                ))}
              </Group>
            )}
            {h.medications.length > 0 && (
              <Group label="Medicines">
                {h.medications.map((m, i) => (
                  <Row key={m.name} title={m.name} subtitle={m.detail || null} last={i === h.medications.length - 1}
                    right={<Text style={styles.cite}>{cites(m.report_ids)}</Text>} />
                ))}
              </Group>
            )}
            {h.trends.length > 0 && (
              <Group label="Trends">
                {h.trends.map((t, i) => (
                  <Row key={t.name} title={t.name} subtitle={t.change || null} last={i === h.trends.length - 1}
                    right={<Text style={[styles.pill, { color: TREND[t.direction].color, backgroundColor: TREND[t.direction].color + "16" }]}>{TREND[t.direction].label}</Text>} />
                ))}
              </Group>
            )}
            {h.events.length > 0 && (
              <Group label="Key events">
                {h.events.map((e, i) => (
                  <Row key={`${e.date}-${i}`} title={e.title} subtitle={[e.date, e.detail].filter(Boolean).join(" · ")} last={i === h.events.length - 1} />
                ))}
              </Group>
            )}

            {data!.shared_with.length > 0 && (
              <Group label="Shared with" footer="They see this summary only, not your files. Every view is in your access history.">
                {data!.shared_with.map((s, i) => (
                  <Row key={s.doctor_id} title={s.doctor_name} last={i === data!.shared_with.length - 1}
                    right={<Pressable onPress={() => toggleShare({ doctor_id: s.doctor_id } as Doctor, true)} hitSlop={8} accessibilityRole="button" style={styles.stop}>
                      <Text style={{ color: colors.danger, fontWeight: "600" }}>Stop</Text>
                    </Pressable>} />
                ))}
              </Group>
            )}
            <Button label="Share with a doctor" icon={<Ionicons name="share-outline" size={18} color="#fff" />} onPress={openShare} />
            <Muted>{h.source === "AI" ? "Written by AI from your records. It can make mistakes; check it with your doctor." : "Put together from your records."}</Muted>
          </>
        )}
      </ScrollView>

      <Analysing visible={generating} done={finished} reportCount={data?.report_count ?? 0} ai={!!data?.ai_enabled} />

      <Modal visible={shareOpen} transparent animationType="slide" onRequestClose={() => setShareOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShareOpen(false)} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.sheetHead}>
            <View style={{ width: 50 }} />
            <Text style={styles.sheetTitle}>Share history</Text>
            <Pressable onPress={() => setShareOpen(false)} hitSlop={10} accessibilityRole="button"><Text style={[styles.link, { fontWeight: "700" }]}>Done</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 30 }}>
            {doctors.length === 0 ? (
              <Muted>Doctors you've given access to appear here. Ask your doctor to scan your QR first.</Muted>
            ) : (
              <>
                {[["Doctors with access now", doctors.filter((d) => d.active)], ["Recent doctors", doctors.filter((d) => !d.active)]].map(([label, list]) =>
                  (list as Doctor[]).length > 0 && (
                    <Group key={label as string} label={label as string}>
                      {(list as Doctor[]).map((d, i, all) => {
                        const on = sharedIds.has(d.doctor_id);
                        return (
                          <Row key={d.doctor_id} title={d.doctor_name} last={i === all.length - 1} onPress={() => toggleShare(d, on)}
                            subtitle={d.active ? `Access ends in ${Math.ceil(d.remaining_seconds / 60)} min` : d.last_seen ? `Seen ${shortDate(d.last_seen)}` : null}
                            right={<Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={24} color={on ? colors.primary : "#b8c2d3"} />} />
                        );
                      })}
                    </Group>
                  ))}
              </>
            )}
            <Muted>The doctor sees only this summary, not your files. You can stop sharing any time.</Muted>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 10 },
  genIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.aiSoft, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  body: { fontSize: 16, lineHeight: 23, color: colors.text },
  basic: { alignSelf: "flex-start", fontSize: 12, fontWeight: "700", color: colors.muted, backgroundColor: "#eef1f6", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" },
  stale: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.aiSoft, borderRadius: 14, padding: 12, minHeight: 44 },
  staleText: { flex: 1, color: colors.ai, fontWeight: "600" },
  cite: { color: colors.muted, fontSize: 14 },
  pill: { fontSize: 12, fontWeight: "700", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  stop: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", alignItems: "center", justifyContent: "center", padding: 20 },
  analyse: { width: "100%", maxWidth: 400, backgroundColor: colors.bg, borderRadius: 28, padding: 24, alignItems: "center", gap: 10 },
  orbWrap: { width: 140, height: 140, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  halo: { position: "absolute", width: 140, height: 140, borderRadius: 70, backgroundColor: "#c9b8fb" },
  orb: { width: 104, height: 104, borderRadius: 52, backgroundColor: "#ece6ff", alignItems: "center", justifyContent: "center" },
  analyseTitle: { fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" },
  analyseSub: { fontSize: 15, color: colors.muted, textAlign: "center" },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepText: { fontSize: 16, color: colors.text },
  privacy: { flexDirection: "row", gap: 10, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, marginTop: 10 },
  privacyText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.35)" },
  sheet: { maxHeight: "80%", backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 8, width: "100%", maxWidth: 560, alignSelf: "center" },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: "#cfd6e2", alignSelf: "center", marginBottom: 8 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginBottom: 6 },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  link: { color: colors.primary, fontSize: 17 },
});
