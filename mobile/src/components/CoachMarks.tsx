import { useCallback, useEffect, useState, type RefObject } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";

type Icon = keyof typeof Ionicons.glyphMap;
type Measurable = { measureInWindow(cb: (x: number, y: number, w: number, h: number) => void): void };
export type CoachStep = { target: RefObject<Measurable | null>; icon: Icon; title: string; text: string };
type Box = { x: number; y: number; w: number; h: number };

const PAD = 6; // breathing room around the highlighted control
const TIP_W = 320;

/** First-run tips on Home: dims the screen and points at one real control at a time. */
export default function CoachMarks({ steps, visible, onClose }: { steps: CoachStep[]; visible: boolean; onClose: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  const measure = useCallback((n: number) => {
    const node = steps[n]?.target.current;
    if (!node) return setBox(null);
    node.measureInWindow((x, y, w, h) => setBox(w && h ? { x: x - PAD, y: y - PAD, w: w + PAD * 2, h: h + PAD * 2 } : null));
  }, [steps]);

  useEffect(() => { if (visible) { setI(0); measure(0); } }, [visible, measure]);
  useEffect(() => { if (visible) measure(i); }, [i, W, H, visible, measure]);

  if (!visible) return null;
  const s = steps[i];
  const last = i === steps.length - 1;
  const next = () => (last ? onClose() : setI(i + 1));

  const tipW = Math.min(TIP_W, W - 32);
  const below = !box || box.y + box.h + 250 < H; // room for the tip card under the target
  const left = box ? Math.min(Math.max(box.x + box.w / 2 - tipW / 2, 16), W - 16 - tipW) : (W - tipW) / 2;
  const top = !box ? H / 2 - 90 : below ? box.y + box.h + 14 : undefined;
  const bottom = box && !below ? H - box.y + 14 : undefined;
  const arrowLeft = box ? Math.min(Math.max(box.x + box.w / 2 - left - 8, 18), tipW - 34) : 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        {/* four dim panels around the target leave it lit and tappable-looking */}
        {box ? (
          <>
            <View style={[st.dim, { left: 0, top: 0, width: W, height: Math.max(box.y, 0) }]} />
            <View style={[st.dim, { left: 0, top: box.y + box.h, width: W, bottom: 0 }]} />
            <View style={[st.dim, { left: 0, top: box.y, width: Math.max(box.x, 0), height: box.h }]} />
            <View style={[st.dim, { left: box.x + box.w, top: box.y, right: 0, height: box.h }]} />
            <View pointerEvents="none" style={[st.ring, { left: box.x, top: box.y, width: box.w, height: box.h }]} />
          </>
        ) : <View style={[st.dim, StyleSheet.absoluteFill]} />}

        <View style={[st.tip, { width: tipW, left, top, bottom }]}>
          {box && <View style={[st.arrow, below ? { top: -7 } : { bottom: -7 }, { left: arrowLeft }]} />}
          <View style={st.tipHead}>
            <View style={st.tipIcon}><Ionicons name={s.icon} size={18} color={colors.primary} /></View>
            <Text style={st.count}>Tip {i + 1} of {steps.length}</Text>
          </View>
          <Text style={st.title} accessibilityRole="header">{s.title}</Text>
          <Text style={st.text}>{s.text}</Text>
          <View style={st.actions}>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" style={st.skip}><Text style={st.skipText}>Skip tips</Text></Pressable>
            <Pressable onPress={next} accessibilityRole="button" style={st.next}><Text style={st.nextText}>{last ? "Done" : "Next"}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  dim: { position: "absolute", backgroundColor: "rgba(15,23,42,0.62)" },
  ring: { position: "absolute", borderRadius: 18, borderWidth: 3, borderColor: colors.primary },
  tip: {
    position: "absolute", backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 6,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  arrow: { position: "absolute", width: 16, height: 16, backgroundColor: colors.card, transform: [{ rotate: "45deg" }] },
  tipHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  tipIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  count: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "800", color: colors.text, marginTop: 4 },
  text: { fontSize: 15, lineHeight: 21, color: colors.muted },
  actions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  skip: { minHeight: 44, justifyContent: "center" },
  skipText: { color: colors.muted, fontWeight: "600", fontSize: 15 },
  next: { minHeight: 44, minWidth: 96, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  nextText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
