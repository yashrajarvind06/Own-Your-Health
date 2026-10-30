import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, purposeLabel } from "@/lib/theme";
import { Group, Muted, Row } from "./ui";

export type LiveSession = {
  doctor_id: number; doctor_name: string; remaining_seconds: number;
  records?: { id: number; record_type: string; record_date: string }[];
};
export type AlertItem = { id: number; rule: string; message: string; created_at: string; seen: boolean };
export type PendingItem = { id: number; doctor_name: string | null; access_reason: string | null };

const mins = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.max(1, Math.ceil(s / 60))} min`);
const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const when = (iso: string) => new Date(iso + "Z").toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Pulse() {
  const v = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.4, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[styles.pulse, { opacity: v }]} />;
}

/** Fills the Health QR card while access is live: who can see the patient's data right now, and which files. */
export function LiveAccess({ sessions }: { sessions: LiveSession[] }) {
  if (!sessions.length) return null;
  return (
    <View style={{ gap: 14 }} accessibilityLiveRegion="polite">
      <View style={styles.liveHead}>
        <Pulse />
        <View style={{ flex: 1 }}>
          <Text style={styles.liveTitle}>Live now</Text>
          <Text style={styles.liveSub}>{sessions.length === 1 ? "A doctor can see your records" : `${sessions.length} doctors can see your records`}</Text>
        </View>
        <Pressable onPress={() => router.push("/access")} hitSlop={8} accessibilityRole="button" style={styles.manage}>
          <Text style={styles.manageText}>Manage</Text>
        </Pressable>
      </View>
      {sessions.slice(0, 3).map((s) => {
        const files = s.records ?? [];
        return (
          <View key={s.doctor_id} style={styles.liveRow}>
            <View style={styles.liveWhoRow}>
              <View style={styles.liveAvatar}><Ionicons name="person" size={18} color={colors.primary} /></View>
              <Text style={styles.liveWho} numberOfLines={1}>{s.doctor_name}</Text>
              <View style={styles.timePill}><Ionicons name="time-outline" size={13} color="#fff" /><Text style={styles.timeText}>{mins(s.remaining_seconds)} left</Text></View>
            </View>
            {files.length ? (
              <>
                <Text style={styles.liveCaption}>Can open {files.length} file{files.length > 1 ? "s" : ""}</Text>
                <View style={styles.chips}>
                  {files.slice(0, 4).map((f) => (
                    <View key={f.id} style={styles.chip}>
                      <Ionicons name="document-text" size={12} color="#fff" />
                      <Text style={styles.chipText} numberOfLines={1}>{f.record_type} · {shortDay(f.record_date)}</Text>
                    </View>
                  ))}
                  {files.length > 4 && <View style={styles.chip}><Text style={styles.chipText}>+{files.length - 4} more</Text></View>}
                </View>
              </>
            ) : (
              <Text style={styles.liveCaption}>No files shared, only your health summary</Text>
            )}
          </View>
        );
      })}
      {sessions.length > 3 && <Text style={styles.liveCaption}>+{sessions.length - 3} more in Access</Text>}
    </View>
  );
}

/** Slides in from the top when a new misuse alert arrives; tapping opens the notifications sheet. */
export function AlertBanner({ alert, onOpen, onDismiss, top }: { alert: AlertItem | null; onOpen: () => void; onDismiss: () => void; top: number }) {
  const y = useRef(new Animated.Value(-160)).current;
  useEffect(() => {
    if (!alert) return;
    Animated.spring(y, { toValue: 0, useNativeDriver: true }).start();
    const t = setTimeout(onDismiss, 9000);
    return () => clearTimeout(t);
  }, [alert, y, onDismiss]);
  if (!alert) return null;
  return (
    <Animated.View style={[styles.banner, { top: top + 8, transform: [{ translateY: y }] }]} accessibilityRole="alert">
      <Pressable style={styles.bannerBody} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Security alert: ${alert.message}`}>
        <View style={styles.bannerIcon}><Ionicons name="warning" size={20} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Unusual access detected</Text>
          <Text style={styles.bannerText} numberOfLines={2}>{alert.message.replace(/^Unusual access detected: /, "")}</Text>
        </View>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss" style={styles.bannerClose}>
        <Ionicons name="close" size={18} color={colors.muted} />
      </Pressable>
    </Animated.View>
  );
}

export type RequestItem = PendingItem & { reason_note?: string | null; doctor_trust?: { score: number; hospital: string | null } };

/** Pops up over any tab the moment a doctor asks for access, so the patient can decide right away. */
export function RequestPopup({ req, onDeny, onReview, onLater }: { req: RequestItem | null; onDeny: () => void; onReview: () => void; onLater: () => void }) {
  if (!req) return null;
  const name = req.doctor_name ?? "A doctor";
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onLater}>
      <View style={styles.center}>
        <View style={styles.popup} accessibilityViewIsModal accessibilityLiveRegion="assertive">
          <View style={styles.popIcon}><Ionicons name="shield-half" size={30} color={colors.primary} /></View>
          <Text style={styles.popKicker}>Access request</Text>
          <Text style={styles.popName}>{name}</Text>
          <Text style={styles.popMeta}>
            {[req.doctor_trust?.hospital, req.doctor_trust ? `Trust ${req.doctor_trust.score}/100` : null].filter(Boolean).join(" · ")}
          </Text>
          <View style={styles.popPurpose}>
            <Text style={styles.popPurposeLabel}>Purpose</Text>
            <Text style={styles.popPurposeText}>{purposeLabel[req.access_reason ?? ""] ?? req.access_reason ?? "Treatment"}</Text>
            {!!req.reason_note && <Text style={styles.popNote}>“{req.reason_note}”</Text>}
          </View>
          <Text style={styles.popHint}>Nothing is shared until you choose what they can see and for how long.</Text>
          <View style={styles.popBtns}>
            <Pressable style={[styles.popBtn, styles.popDeny]} onPress={onDeny} accessibilityRole="button"><Text style={styles.popDenyText}>Deny</Text></Pressable>
            <Pressable style={[styles.popBtn, styles.popReview]} onPress={onReview} accessibilityRole="button"><Text style={styles.popReviewText}>Review…</Text></Pressable>
          </View>
          <Pressable onPress={onLater} hitSlop={8} accessibilityRole="button" style={{ minHeight: 40, justifyContent: "center" }}>
            <Text style={styles.popLater}>Decide later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** The bell's sheet: security alerts first, then access requests waiting for a decision. */
export function NotificationsSheet({ visible, onClose, alerts, pending }: { visible: boolean; onClose: () => void; alerts: AlertItem[]; pending: PendingItem[] }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.sheetHead}>
          <View style={{ width: 50 }} />
          <Text style={styles.sheetTitle}>Notifications</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button"><Text style={styles.done}>Done</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 30 }}>
          {pending.length > 0 && (
            <Group label="Waiting for your decision">
              {pending.map((p, i) => (
                <Row key={p.id} title={p.doctor_name ?? "A doctor"} subtitle={`Wants access · ${purposeLabel[p.access_reason ?? ""] ?? p.access_reason ?? "Treatment"}`}
                  last={i === pending.length - 1} left={<Ionicons name="person-circle" size={30} color={colors.primary} />}
                  onPress={() => { onClose(); router.push("/access"); }} />
              ))}
            </Group>
          )}
          <Group label="Security alerts" footer="We alert you to unusual access; we never block your doctor silently. Revoke access any time from the Access tab.">
            {alerts.length === 0 ? <Row title="No unusual access" subtitle="You'll be alerted here if anything looks off." last /> : alerts.map((a, i) => (
              <Row key={a.id} title={a.message.replace(/^Unusual access detected: /, "")} subtitle={when(a.created_at)} last={i === alerts.length - 1}
                left={<Ionicons name="warning" size={22} color={a.seen ? colors.muted : colors.danger} />} />
            ))}
          </Group>
          {!alerts.length && !pending.length && <Muted>You're all caught up.</Muted>}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  liveHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  pulse: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#69f0ae" },
  liveTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  liveSub: { color: "#e3eeff", fontSize: 14 },
  manage: { backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 14, minHeight: 36, justifyContent: "center" },
  manageText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  liveRow: { gap: 8, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.26)", padding: 12 },
  liveWhoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  liveAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  liveWho: { flex: 1, color: "#fff", fontWeight: "700", fontSize: 16 },
  timePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.18)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  timeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  liveCaption: { color: "#e3eeff", fontSize: 13 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: "100%" },
  chipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  banner: { position: "absolute", left: 12, right: 12, zIndex: 50, maxWidth: 520, alignSelf: "center", flexDirection: "row", alignItems: "flex-start", backgroundColor: "#fff", borderRadius: 18, borderLeftWidth: 4, borderLeftColor: colors.danger, padding: 12, gap: 8, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  bannerBody: { flex: 1, flexDirection: "row", gap: 10 },
  bannerIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  bannerTitle: { color: colors.danger, fontWeight: "800" },
  bannerText: { color: colors.text, fontSize: 14, lineHeight: 19 },
  bannerClose: { padding: 4 },
  center: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", alignItems: "center", justifyContent: "center", padding: 20 },
  popup: { width: "100%", maxWidth: 380, backgroundColor: colors.card, borderRadius: 26, padding: 22, alignItems: "center", gap: 6 },
  popIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  popKicker: { color: colors.primary, fontWeight: "800", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  popName: { color: colors.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
  popMeta: { color: colors.muted, fontSize: 14 },
  popPurpose: { alignSelf: "stretch", backgroundColor: colors.bg, borderRadius: 14, padding: 12, marginTop: 8, gap: 2 },
  popPurposeLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  popPurposeText: { color: colors.text, fontSize: 17, fontWeight: "700" },
  popNote: { color: colors.text, fontSize: 14, fontStyle: "italic", marginTop: 4 },
  popHint: { color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 6 },
  popBtns: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 10 },
  popBtn: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  popDeny: { backgroundColor: "#eef1f6" },
  popDenyText: { color: colors.text, fontWeight: "700", fontSize: 16 },
  popReview: { backgroundColor: colors.primary },
  popReviewText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  popLater: { color: colors.primary, fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.35)" },
  sheet: { maxHeight: "80%", backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 8, width: "100%", maxWidth: 560, alignSelf: "center" },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: "#cfd6e2", alignSelf: "center", marginBottom: 8 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginBottom: 6 },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  done: { color: colors.primary, fontSize: 17, fontWeight: "700" },
});
