import { useEffect, useState } from "react";
import { AccessibilityInfo, Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "expo-router/tabs";
import { colors } from "@/lib/theme";
import { WIDE } from "./ui";

// Selected tabs use the filled symbol, others the outline (tab-bars.md: prefer filled symbols)
const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  index: ["home", "home-outline"],
  records: ["document-text", "document-text-outline"],
  access: ["shield-checkmark", "shield-checkmark-outline"],
  profile: ["person-circle", "person-circle-outline"],
};

/** Reduce Transparency (iOS setting / web media query) gets an opaque bar instead of glass. */
function useReduceTransparency() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") {
      const mq = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-transparency: reduce)");
      if (!mq) return;
      setReduce(mq.matches);
      const on = (e: MediaQueryListEvent) => setReduce(e.matches);
      mq.addEventListener?.("change", on);
      return () => mq.removeEventListener?.("change", on);
    }
    AccessibilityInfo.isReduceTransparencyEnabled?.().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceTransparencyChanged", setReduce);
    return () => sub?.remove();
  }, []);
  return reduce;
}

/**
 * Liquid Glass navigation: a floating capsule over the content on phones, an inset glass sidebar on desktop.
 * Glass is used only here (the functional layer); content stays opaque (liquid-glass.md).
 */
export default function GlassTabBar({ state, descriptors, navigateToTab, insets }: BottomTabBarProps) {
  const wide = useWindowDimensions().width >= WIDE;
  const reduce = useReduceTransparency();
  // Android draws blur poorly and its own design language doesn't use glass, so it gets a near-opaque bar
  const opaque = reduce || Platform.OS === "android";

  const items = state.routes.map((route, i) => {
    const { options } = descriptors[route.key];
    const focused = state.index === i;
    const [filled, outline] = ICONS[route.name] ?? ["ellipse", "ellipse-outline"];
    const label = options.title ?? route.name;
    const badge = options.tabBarBadge;
    return (
      <Pressable
        key={route.key}
        onPress={() => !focused && navigateToTab(route.key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={badge ? `${label}, ${badge} new` : label}
        style={({ hovered }: any) => [
          wide ? styles.sideItem : styles.tabItem,
          focused && styles.itemOn,
          hovered && !focused && styles.itemHover,
        ]}
      >
        <View>
          <Ionicons name={focused ? filled : outline} size={wide ? 20 : 23} color={focused ? colors.primary : "#4b5568"} />
          {badge !== undefined && !wide && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
        </View>
        <Text style={[wide ? styles.sideLabel : styles.tabLabel, focused && styles.labelOn]}>{label}</Text>
        {badge !== undefined && wide && <View style={[styles.badge, styles.badgeSide]}><Text style={styles.badgeText}>{badge}</Text></View>}
      </Pressable>
    );
  });

  const surface = (children: React.ReactNode, shape: object) =>
    opaque ? (
      <View style={[shape, styles.opaque]}>{children}</View>
    ) : (
      <BlurView intensity={60} tint="systemChromeMaterialLight" style={[shape, styles.glass]}>
        <View style={styles.sheen} pointerEvents="none" />
        {children}
      </BlurView>
    );

  if (wide) {
    return surface(
      <>
        <View style={styles.brandRow}>
          <Image source={require("../../assets/logo-mark.png")} style={{ width: 30, height: 30 }} accessibilityLabel="OwnYourHealth logo" />
          <Text style={styles.brand}>Own<Text style={{ color: colors.primary }}>Your</Text>Health</Text>
        </View>
        {items}
      </>,
      [styles.sidebar, { marginTop: insets.top + 12 }],
    );
  }
  return (
    <View pointerEvents="box-none" style={[styles.tabWrap, { bottom: Math.max(insets.bottom, 10) + 6 }]}>
      {surface(<View style={styles.tabRow}>{items}</View>, styles.capsule)}
    </View>
  );
}

const styles = StyleSheet.create({
  tabWrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  capsule: { width: "100%", maxWidth: 460, height: 66, borderRadius: 33, overflow: "hidden" },
  tabRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 6 },
  glass: {
    borderWidth: 1, borderColor: "rgba(255,255,255,0.75)",
    shadowColor: "#1f2a44", shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  // translucent fill + top highlight that gives the glass its edge (blur alone looks flat)
  sheen: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(255,255,255,0.45)", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.9)" },
  opaque: {
    backgroundColor: "#ffffff", borderWidth: 1, borderColor: colors.border,
    shadowColor: "#1f2a44", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  tabItem: { minWidth: 64, minHeight: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 10 },
  itemOn: { backgroundColor: "rgba(26,115,232,0.12)" },
  itemHover: { backgroundColor: "rgba(31,42,68,0.05)" },
  tabLabel: { fontSize: 11, fontWeight: "600", color: "#4b5568" },
  labelOn: { color: colors.primary },
  badge: { position: "absolute", top: -4, right: -10, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#e53935", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeSide: { position: "relative", top: 0, right: 0, marginLeft: "auto" },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  sidebar: { width: 232, marginLeft: 12, marginBottom: 12, borderRadius: 24, overflow: "hidden", paddingVertical: 18, paddingHorizontal: 10, gap: 4 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 14 },
  brand: { fontSize: 17, fontWeight: "800", color: colors.text },
  sideItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, minHeight: 44, borderRadius: 12 },
  sideLabel: { fontSize: 15, fontWeight: "600", color: "#2b3447" },
});
