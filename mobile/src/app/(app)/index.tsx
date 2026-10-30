import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { colors, purposeLabel } from "@/lib/theme";
import { AlertBanner, LiveAccess, NotificationsSheet, type AlertItem, type LiveSession } from "@/components/HomeLive";
import SummaryCard, { type Summary } from "@/components/SummaryCard";
import { Muted, ui, WIDE } from "@/components/ui";

type Icon = keyof typeof Ionicons.glyphMap;
type Service = { label: string; sub: string; icon: Icon; tint: string; color: string; href: string };

// First four show as tiles; "View all" reveals the rest (the reference's "Our Services")
const SERVICES: Service[] = [
  { label: "Upload", sub: "Add a record", icon: "cloud-upload", tint: "#e3f2fd", color: colors.primary, href: "/upload" },
  { label: "Emergency", sub: "Offline card", icon: "medkit", tint: "#fdecea", color: colors.danger, href: "/emergency" },
  { label: "Share", sub: "Expiring link", icon: "share-social", tint: "#fff8e1", color: colors.warn, href: "/share" },
  { label: "Doctors", sub: "Find & invite", icon: "search", tint: "#e0f7fa", color: "#00838f", href: "/doctors" },
  { label: "Ask", sub: "Records chatbot", icon: "chatbubbles", tint: "#ede7f6", color: "#5e35b1", href: "/assistant" },
  { label: "Trends", sub: "BP, sugar, weight", icon: "pulse", tint: "#e8f5e9", color: colors.ok, href: "/trends" },
  { label: "History", sub: "Who saw what", icon: "time", tint: "#eceff1", color: "#455a64", href: "/history" },
  { label: "Family", sub: "Caregivers", icon: "people", tint: "#fce4ec", color: "#ad1457", href: "/family" },
];

const PROMISES: { icon: Icon; title: string; text: string }[] = [
  { icon: "lock-closed", title: "Nothing without consent", text: "Doctors see only what you approve, for the purpose they state." },
  { icon: "timer", title: "Time-limited & revocable", text: "Access expires on its own. Revoke anytime, effective instantly." },
  { icon: "eye", title: "Every view is logged", text: "Unusual access raises an alert to you, never silently." },
  { icon: "finger-print", title: "Tamper-evident", text: "Every upload is fingerprinted (SHA-256), so changes show." },
];

type Pending = { id: number; doctor_name: string | null; access_reason: string | null; doctor_trust?: { score: number; hospital: string | null } };
// Same fields as the Complete your profile screen, in the order the reminder asks for them
const PROFILE_FIELDS = [["blood_group", "blood group"], ["allergies", "allergies"], ["chronic_diseases", "conditions"], ["medications", "medicines"], ["emergency_contact", "emergency contact"]] as const;
type Rec = { id: number; record_type: string; record_date: string; one_line_summary: string };

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

function SectionHead({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return (
    <View style={styles.secHead}>
      <Text style={styles.secTitle}>{title}</Text>
      {action && <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button"><Text style={styles.secLink}>{action} ›</Text></Pressable>}
    </View>
  );
}

/** "Book Appointment" in the reference becomes the doctor-scan QR (it expires, so it's made on demand).
 *  While a doctor has access, the whole card switches to who is viewing and what they can see. */
function QrCard({ onOpen, live }: { onOpen: () => void; live: LiveSession[] }) {
  return (
    <LinearGradient colors={["#0b57d0", "#1a73e8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroBlob} />
      {live.length > 0 ? <LiveAccess sessions={live} /> : (
      <View style={styles.heroRow}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.heroTitle}>My Health QR</Text>
        <Text style={styles.heroText}>Show it to your doctor. You approve what they see.</Text>
        <Pressable style={styles.heroBtn} onPress={onOpen} accessibilityRole="button">
          <Text style={styles.heroBtnText}>Generate QR</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        </Pressable>
      </View>
      <Pressable style={styles.heroQr} onPress={onOpen} accessibilityLabel="Generate my QR code">
        <Ionicons name="qr-code" size={52} color={colors.primary} />
      </Pressable>
      </View>
      )}
    </LinearGradient>
  );
}

function QrSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { request } = useSession();
  const [qr, setQr] = useState<{ png: string; until: number } | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setError(null);
    setQr(null);
    try {
      const res = await request<{ png_base64: string; expires_in_seconds: number }>("/qr/generate-image", { method: "POST", body: "{}" });
      setQr({ png: res.png_base64, until: Date.now() + res.expires_in_seconds * 1000 });
    } catch (e: any) {
      setError(`Couldn't create your QR: ${e.message}`);
    }
  }, [request]);

  useEffect(() => { if (visible) generate(); }, [visible, generate]); // a fresh code every time the sheet opens

  useEffect(() => {
    if (!qr) return;
    const tick = () => setLeft(Math.max(0, Math.round((qr.until - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [qr]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>Show this to your doctor</Text>
        <Muted>Scanning it sends you an access request. Nothing is shared until you approve.</Muted>
        <View style={styles.qrFrame}>
          {qr && left > 0 ? (
            <Image source={{ uri: `data:image/png;base64,${qr.png}` }} style={styles.qrImg} accessibilityLabel="My QR code for doctors" />
          ) : error ? (
            <Text style={ui.error}>{error}</Text>
          ) : qr ? (
            <Pressable onPress={generate} style={{ alignItems: "center", gap: 6 }} accessibilityRole="button">
              <Ionicons name="refresh" size={36} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "700" }}>Expired — tap for a new code</Text>
            </Pressable>
          ) : (
            <Muted>Creating your code…</Muted>
          )}
        </View>
        {qr && left > 0 && <Text style={styles.timer}>Valid for {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} · new code each time</Text>}
        <Pressable style={styles.done} onPress={onClose} accessibilityRole="button"><Text style={styles.doneText}>Done</Text></Pressable>
      </View>
    </Modal>
  );
}

export default function Home() {
  const { request } = useSession();
  const wide = useWindowDimensions().width >= WIDE;
  const insets = useSafeAreaInsets(); // Home has no header bar, so keep clear of the notch/status bar
  const [name, setName] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [latest, setLatest] = useState<Rec | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [insights, setInsights] = useState<{ enabled: boolean; alerts: string[] } | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [live, setLive] = useState<LiveSession[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [banner, setBanner] = useState<AlertItem | null>(null);
  const bannered = useRef(new Set<number>()); // pop each alert up once per app session
  const [allServices, setAllServices] = useState(false);
  const [fullSnapshot, setFullSnapshot] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);

  useFocusEffect(useCallback(() => {
    request<Record<string, string | null>>("/auth/me/profile")
      .then((p) => setMissing(PROFILE_FIELDS.filter(([k]) => !p[k]?.trim()).map(([, label]) => label))).catch(() => {});
    request<{ display_name: string | null }>("/user/me/profile").then((p) => setName(p.display_name)).catch(() => {});
    request<Rec[]>("/reports/my").then((r) => setLatest(r[0] ?? null)).catch(() => {});
    request<Summary>("/reports/summary").then(setSummary).catch(() => {});
    request<{ enabled: boolean; alerts: string[] }>("/reports/insights").then(setInsights).catch(() => {});
  }, [request]));

  // Live data: refreshed every 15 s while Home is open, so new access and misuse alerts show up on their own
  const poll = useCallback(() => {
    request<Pending[]>("/access/requests/pending").then(setPending).catch(() => {});
    request<LiveSession[]>("/access/patient/active").then(setLive).catch(() => {});
    request<AlertItem[]>("/alerts").then((a) => {
      setAlerts(a);
      const fresh = a.find((x) => !x.seen && !bannered.current.has(x.id));
      if (fresh) { bannered.current.add(fresh.id); setBanner(fresh); }
    }).catch(() => {});
  }, [request]);
  useFocusEffect(useCallback(() => {
    poll();
    const t = setInterval(poll, 15000);
    return () => clearInterval(t);
  }, [poll]));

  const openNotifications = () => {
    setBanner(null);
    setNotifOpen(true);
    const unseen = alerts.filter((a) => !a.seen);
    setAlerts((all) => all.map((a) => ({ ...a, seen: true })));
    unseen.forEach((a) => request(`/alerts/${a.id}/seen`, { method: "POST", body: "{}" }).catch(() => {}));
  };
  const dismissBanner = useCallback(() => setBanner(null), []);

  const firstName = (name ?? "").split(" ")[0];
  const services = allServices ? SERVICES : SERVICES.slice(0, 4);
  const attention = alerts.filter((a) => !a.seen).length + pending.length;

  const header = (
    <>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>{greeting()}{firstName ? `, ${firstName}` : ""}</Text>
          <Text style={styles.big}>Take care of{"\n"}your <Text style={{ color: colors.primary }}>health.</Text></Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 10 }}>
          <Pressable style={styles.bell} onPress={openNotifications} accessibilityRole="button"
            accessibilityLabel={attention ? `Notifications, ${attention} new` : "Notifications"}>
            <Ionicons name={attention ? "notifications" : "notifications-outline"} size={20} color={attention ? colors.primary : colors.text} />
            {attention > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{attention > 9 ? "9+" : attention}</Text></View>}
          </Pressable>
          <LinearGradient colors={["#e3f0ff", "#bcd8fb"]} style={styles.avatar}>
            <Ionicons name="medical" size={40} color={colors.primary} />
          </LinearGradient>
        </View>
      </View>
      <Pressable style={styles.search} onPress={() => router.push("/assistant")} accessibilityRole="search">
        <Ionicons name="search" size={18} color="#6e7891" />
        <Text style={styles.searchText}>Ask about your records…</Text>
        <View style={styles.searchBadge}><Ionicons name="sparkles" size={16} color={colors.primary} /></View>
      </Pressable>
    </>
  );

  const leftCol = (
    <View style={{ gap: 4 }}>
      {header}
      {missing.length > 0 && (
        <Pressable style={styles.nudge} onPress={() => router.push("/complete-profile")} accessibilityRole="button"
          accessibilityLabel={`Complete your profile, ${PROFILE_FIELDS.length - missing.length} of ${PROFILE_FIELDS.length} done`}>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={styles.cardTitle}>Complete your profile</Text>
            <View style={styles.nudgeTrack}><View style={[styles.nudgeBar, { width: `${((PROFILE_FIELDS.length - missing.length) / PROFILE_FIELDS.length) * 100}%` }]} /></View>
            <Text style={styles.cardMeta}>{PROFILE_FIELDS.length - missing.length} of {PROFILE_FIELDS.length} done · Add your {missing[0]}</Text>
          </View>
          <Text style={styles.secLink}>Finish ›</Text>
        </Pressable>
      )}
      <QrCard onOpen={() => setQrOpen(true)} live={live} />
      <SectionHead title="Our Services" action={allServices ? "Show less" : "View all"} onPress={() => setAllServices(!allServices)} />
      <View style={styles.services}>
        {services.map((s) => (
          <Pressable key={s.href} style={styles.svc} onPress={() => router.push(s.href as any)} accessibilityRole="button" accessibilityLabel={s.label}>
            <View style={[styles.svcIcon, { backgroundColor: s.tint }]}><Ionicons name={s.icon} size={22} color={s.color} /></View>
            <Text style={styles.svcLabel}>{s.label}</Text>
            <Text style={styles.svcSub}>{s.sub}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const first = pending[0];
  const rightCol = (
    <View style={{ gap: 4 }}>
      <SectionHead title={first ? "Waiting for you" : "Latest record"} action="View all" onPress={() => router.push(first ? "/access" : "/records")} />
      {first ? (
        <Pressable style={styles.card} onPress={() => router.push("/access")} accessibilityRole="button">
          <View style={styles.docAvatar}><Ionicons name="person" size={24} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{first.doctor_name ?? "A doctor"}</Text>
            {first.doctor_trust && <Muted>{first.doctor_trust.hospital ? `${first.doctor_trust.hospital} · ` : ""}Trust {first.doctor_trust.score}/100</Muted>}
            <Text style={styles.cardMeta}>Wants access · {purposeLabel[first.access_reason ?? ""] ?? first.access_reason}</Text>
          </View>
          <View style={styles.pill}><Text style={styles.pillText}>{pending.length > 1 ? `${pending.length} to review` : "Review"}</Text></View>
        </Pressable>
      ) : latest ? (
        <Pressable style={styles.card} onPress={() => router.push("/records")} accessibilityRole="button">
          <View style={[styles.docAvatar, { backgroundColor: "#e8f5e9" }]}><Ionicons name="document-text" size={22} color={colors.ok} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{latest.record_type}</Text>
            <Muted>{new Date(latest.record_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Muted>
            <Text style={styles.cardMeta} numberOfLines={2}>{latest.one_line_summary}</Text>
          </View>
        </Pressable>
      ) : (
        <Pressable style={styles.card} onPress={() => router.push("/upload")} accessibilityRole="button">
          <View style={styles.docAvatar}><Ionicons name="cloud-upload" size={22} color={colors.primary} /></View>
          <Text style={[styles.cardTitle, { flex: 1 }]}>Upload your first record to get started</Text>
        </Pressable>
      )}

      <SectionHead title="Health Insights" action={fullSnapshot ? "Show less" : "View all"} onPress={() => setFullSnapshot(!fullSnapshot)} />
      {fullSnapshot ? <SummaryCard /> : (
        <Pressable style={styles.card} onPress={() => setFullSnapshot(true)} accessibilityRole="button">
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.cardTitle}>Your health snapshot</Text>
            <Text style={styles.cardMeta} numberOfLines={3}>{summary?.overview ?? "Upload records to build your snapshot."}</Text>
          </View>
          <LinearGradient colors={["#ffebee", "#ffcdd2"]} style={styles.heart}><Ionicons name="heart" size={34} color="#e53935" /></LinearGradient>
        </Pressable>
      )}
      {insights?.enabled && insights.alerts.map((a) => (
        <View key={a} style={[styles.card, { paddingVertical: 12 }]}>
          <Ionicons name="trending-up" size={18} color={colors.warn} />
          <Text style={{ flex: 1, color: colors.text }}>{a}</Text>
        </View>
      ))}
      {insights && !insights.enabled && (
        <Pressable onPress={() => router.push("/profile")}><Muted>Turn on health pattern alerts in Profile to see trends like “BP values increasing”.</Muted></Pressable>
      )}

      <View style={styles.promise}>
        <View style={ui.row}><Ionicons name="shield-checkmark" size={20} color="#ffca28" /><Text style={styles.promiseTitle}>Your data, your control</Text></View>
        {PROMISES.map((p) => (
          <View key={p.title} style={styles.promiseRow}>
            <Ionicons name={p.icon} size={18} color="#90caf9" />
            <View style={{ flex: 1 }}>
              <Text style={styles.promiseHead}>{p.title}</Text>
              <Text style={styles.promiseText}>{p.text}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={ui.screen}>
    <ScrollView style={ui.screen} contentContainerStyle={[ui.content, { paddingTop: insets.top + 12 }]}>
      {wide ? (
        <View style={styles.columns}>
          <View style={{ flex: 3 }}>{leftCol}</View>
          <View style={{ flex: 2, paddingTop: 70 }}>{rightCol}</View>
        </View>
      ) : (
        <>{leftCol}{rightCol}</>
      )}
      <QrSheet visible={qrOpen} onClose={() => setQrOpen(false)} />
      <NotificationsSheet visible={notifOpen} onClose={() => setNotifOpen(false)} alerts={alerts} pending={pending} />
    </ScrollView>
    <AlertBanner alert={banner} onOpen={openNotifications} onDismiss={dismissBanner} top={insets.top} />
    </View>
  );
}

const soft = { shadowColor: "#1f2a44", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 };

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 4 },
  hello: { color: colors.muted, fontSize: 15 },
  big: { fontSize: 28, lineHeight: 34, fontWeight: "800", color: colors.text, marginTop: 4 },
  bell: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: "#e53935", borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  avatar: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingLeft: 14, marginTop: 16, ...soft },
  searchText: { flex: 1, color: "#6e7891", fontSize: 15, paddingVertical: 14 },
  searchBadge: { width: 46, alignSelf: "stretch", alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: colors.border },
  hero: { marginTop: 18, borderRadius: 22, padding: 20, overflow: "hidden" },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroBlob: { position: "absolute", right: -40, bottom: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.13)" },
  heroTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  heroText: { color: "#ffffff", fontSize: 15, lineHeight: 20, maxWidth: 240 },
  heroBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8 },
  heroBtnText: { color: colors.primary, fontWeight: "700" },
  heroQr: { width: 96, height: 96, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", ...soft },
  nudge: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 14 },
  nudgeTrack: { height: 6, borderRadius: 3, backgroundColor: "#e3e8f0", overflow: "hidden" },
  nudgeBar: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  secHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 22, marginBottom: 10 },
  secTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  secLink: { color: colors.primary, fontWeight: "600" },
  services: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  svc: { width: "22%", flexGrow: 1, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 4, alignItems: "center", gap: 6, ...soft },
  svcIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  svcLabel: { fontWeight: "700", color: colors.text, fontSize: 13 },
  svcSub: { color: colors.muted, fontSize: 12, textAlign: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 8, ...soft },
  docAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  cardMeta: { color: colors.muted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  pill: { backgroundColor: "#fff3e0", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { color: "#e65100", fontSize: 12, fontWeight: "700" },
  heart: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  promise: { backgroundColor: "#1f2a44", borderRadius: 18, padding: 18, gap: 12, marginTop: 14 },
  promiseTitle: { color: "#fff", fontWeight: "700", fontSize: 16 },
  promiseRow: { flexDirection: "row", gap: 12 },
  promiseHead: { color: "#fff", fontWeight: "700" },
  promiseText: { color: "#b0bec5", fontSize: 12, lineHeight: 17 },
  columns: { flexDirection: "row", gap: 24, alignItems: "flex-start" },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 34, alignItems: "center", gap: 8, width: "100%", maxWidth: 520, alignSelf: "center" },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: "#dfe6f0", marginBottom: 6 },
  sheetTitle: { fontSize: 19, fontWeight: "800", color: colors.text },
  qrFrame: { width: 236, height: 236, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginTop: 8, padding: 8 },
  qrImg: { width: 220, height: 220 },
  timer: { color: colors.muted, fontWeight: "600" },
  done: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignSelf: "stretch", alignItems: "center", marginTop: 10 },
  doneText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
