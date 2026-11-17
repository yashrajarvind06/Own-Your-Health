import { useEffect, useState, type ReactNode } from "react";
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";
import { WIDE } from "@/components/ui";
import { AiPreview, ConsentPreview, DecayPreview, EmergencyPreview, MisusePreview, SharePreview } from "@/components/TourPreviews";

type Icon = keyof typeof Ionicons.glyphMap;
const KEY = "oyh_tour_seen_v1";

// Same split as lib/session: SecureStore is native-only, web uses localStorage
const seenStore = Platform.OS === "web"
  ? { get: async () => { try { return localStorage.getItem(KEY); } catch { return "1"; } }, set: async () => { try { localStorage.setItem(KEY, "1"); } catch {} } }
  : { get: () => SecureStore.getItemAsync(KEY), set: () => SecureStore.setItemAsync(KEY, "1") };

/** True until the tour has been finished or skipped once on this device. */
export function useFirstRunTour() {
  const [show, setShow] = useState(false);
  useEffect(() => { seenStore.get().then((v) => setShow(!v)).catch(() => {}); }, []);
  return [show, setShow] as const;
}


type Slide = { icon: Icon; color: string; tint: string; eyebrow: string; title: string; body: string; cta?: { label: string; href: string }; preview: ReactNode };

const SLIDES: Slide[] = [
  {
    icon: "qr-code", color: colors.primary, tint: colors.primarySoft, eyebrow: "Consent first",
    title: "Show your QR. You decide.",
    body: "A doctor scans your QR and asks for access with a reason. You choose what they see and for how long, and you can revoke it at any moment.",
    preview: <ConsentPreview />,
  },
  {
    icon: "medkit", color: colors.danger, tint: "#fdecea", eyebrow: "Emergency card",
    title: "Speaks for you when you can't",
    body: "Blood group, allergies, conditions, medicines and who to call, readable by any responder who scans your QR. No app or login needed. Put it on your college ID card.",
    cta: { label: "Set up my emergency card", href: "/emergency" },
    preview: <EmergencyPreview />,
  },
  {
    icon: "eye", color: colors.warn, tint: "#fff8e1", eyebrow: "Misuse detection",
    title: "We watch who looks",
    body: "If someone opens your records at odd hours, without your consent, or is reading far too many patients' files, you get an alert on the bell right away. Every view stays in your access history.",
    cta: { label: "See my access history", href: "/history" },
    preview: <MisusePreview />,
  },
  {
    icon: "sparkles", color: colors.ai, tint: colors.aiSoft, eyebrow: "AI summaries",
    title: "Reports in plain words",
    body: "Every report you upload gets a one-line summary, and your health snapshot pulls them together. You can also ask questions about your records. AI can make mistakes, so check anything important with your doctor.",
    cta: { label: "Ask about my records", href: "/assistant" },
    preview: <AiPreview />,
  },
  {
    icon: "hourglass", color: "#00838f", tint: "#e0f7fa", eyebrow: "Relevance decay",
    title: "Old records step back",
    body: "Prescriptions fade after 6 months and most reports after a year, so doctors see what matters now first. Surgeries, allergies and discharge summaries never fade, and nothing is ever deleted.",
    cta: { label: "View my records", href: "/records" },
    preview: <DecayPreview />,
  },
  {
    icon: "people", color: "#ad1457", tint: "#fce4ec", eyebrow: "Share & family",
    title: "Care, without handing over the keys",
    body: "Send a link that expires on its own, or let a parent or caregiver help manage your records with only the permissions you pick. Every upload is fingerprinted, so any change to a file shows.",
    cta: { label: "Set up family access", href: "/family" },
    preview: <SharePreview />,
  },
];

/** "Get to know OwnYourHealth": a full-screen tour, shown once after sign-in and again from Profile. */
export default function WelcomeTour({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= WIDE;
  useEffect(() => { if (visible) setI(0); }, [visible]);
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;

  const close = (href?: string) => {
    seenStore.set().catch(() => {});
    onClose();
    if (href) router.push(href as any);
  };

  const stage = (
    <View style={[st.stage, { backgroundColor: s.tint }, wide && st.stageWide]}>
      <View style={[st.previewBox, wide && { transform: [{ scale: 1.2 }] }]}>{s.preview}</View>
    </View>
  );

  const copy = (
    <View style={[st.copy, wide && st.copyWide]}>
      <View style={st.eyebrowRow}>
        <View style={[st.eyebrowIcon, { backgroundColor: s.tint }]}><Ionicons name={s.icon} size={16} color={s.color} /></View>
        <Text style={[st.eyebrow, { color: s.color }]}>{s.eyebrow}</Text>
      </View>
      <Text style={[st.title, wide && { fontSize: 36, lineHeight: 42 }]} accessibilityRole="header">{s.title}</Text>
      <Text style={st.body}>{s.body}</Text>
      {s.cta && (
        <Pressable onPress={() => close(s.cta!.href)} accessibilityRole="link" hitSlop={6} style={st.ctaRow}>
          <Text style={[st.cta, { color: s.color }]}>{s.cta.label}</Text>
          <Ionicons name="arrow-forward" size={16} color={s.color} />
        </Pressable>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => close()}>
      <View style={[st.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]} accessibilityViewIsModal>
        <View style={st.inner}>
          <View style={st.header}>
            <Image source={require("../../assets/logo-mark.png")} style={st.logo} accessibilityLabel="OwnYourHealth logo" />
            <View style={{ flex: 1 }}>
              <Text style={st.brand}>Own<Text style={{ color: colors.primary }}>Your</Text>Health</Text>
              <Text style={st.tagline}>Your health records, your control</Text>
            </View>
            <Pressable onPress={() => close()} hitSlop={10} accessibilityRole="button" style={st.skip}>
              <Text style={st.skipText}>Skip</Text>
            </Pressable>
          </View>

          <View style={st.progress} accessibilityLabel={`Step ${i + 1} of ${SLIDES.length}`}>
            {SLIDES.map((x, n) => (
              <Pressable key={x.eyebrow} onPress={() => setI(n)} style={st.segHit} accessibilityRole="button" accessibilityLabel={`Go to ${x.eyebrow}`}>
                <View style={[st.seg, n <= i && { backgroundColor: colors.primary }]} />
              </Pressable>
            ))}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={[st.body2, wide && st.body2Wide]} showsVerticalScrollIndicator={false}>
            {stage}
            {copy}
          </ScrollView>

          <View style={[st.actions, wide && { alignSelf: "flex-end", width: 420 }]}>
            {i > 0 ? (
              <Pressable style={st.back} onPress={() => setI(i - 1)} accessibilityRole="button"><Text style={st.backText}>Back</Text></Pressable>
            ) : <View style={{ flex: 1 }} />}
            <Pressable style={st.next} onPress={() => (last ? close() : setI(i + 1))} accessibilityRole="button">
              <Text style={st.nextText}>{last ? "Get started" : "Continue"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  inner: { flex: 1, width: "100%", maxWidth: 1040, alignSelf: "center", gap: 18 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 40, height: 40 },
  brand: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.2 },
  tagline: { fontSize: 13, color: colors.muted },
  skip: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  skipText: { color: colors.primary, fontWeight: "600", fontSize: 16 },
  progress: { flexDirection: "row", gap: 6 },
  segHit: { flex: 1, paddingVertical: 8 },
  seg: { height: 4, borderRadius: 2, backgroundColor: "#d5dde9" },
  body2: { flexGrow: 1, gap: 22, paddingBottom: 8 },
  body2Wide: { flexDirection: "row", alignItems: "center", gap: 56 },
  stage: { borderRadius: 28, alignItems: "center", justifyContent: "center", paddingVertical: 22, paddingHorizontal: 18, borderWidth: 1, borderColor: "rgba(31,42,68,0.06)" },
  stageWide: { flex: 1.1, paddingVertical: 40, paddingHorizontal: 36 },
  previewBox: { width: "100%", maxWidth: 400, alignItems: "center" },
  copy: { gap: 12 },
  copyWide: { flex: 1 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrowIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  body: { fontSize: 17, lineHeight: 25, color: colors.muted, maxWidth: 520 },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, alignSelf: "flex-start" },
  cta: { fontWeight: "700", fontSize: 16 },
  actions: { flexDirection: "row", gap: 12 },
  back: { flex: 1, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  backText: { color: colors.text, fontWeight: "600", fontSize: 16 },
  next: { flex: 2, minHeight: 52, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  nextText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
