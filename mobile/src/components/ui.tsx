import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/lib/theme";

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** iOS large title (34 pt bold) at the top of a tab's content, with an optional toolbar action on the right. */
export function LargeTitle({ title, action }: { title: string; action?: ReactNode }) {
  const top = useSafeAreaInsets().top;
  return (
    <View style={[styles.largeRow, { paddingTop: top + 8 }]}>
      <Text style={styles.largeTitle} accessibilityRole="header">{title}</Text>
      {action}
    </View>
  );
}

/** Round toolbar button (44 pt target) for a screen's main action, e.g. Add. */
export function ToolbarButton({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.toolbarBtn} hitSlop={6}>
      {icon}
    </Pressable>
  );
}

/** Settings-style inset grouped list: an uppercase section label and rows separated by hairlines. */
export function Group({ label, footer, children }: { label?: string; footer?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={styles.groupLabel}>{label}</Text>}
      <View style={styles.group}>{children}</View>
      {footer && <Text style={styles.groupFooter}>{footer}</Text>}
    </View>
  );
}

export function Row({ title, subtitle, left, right, onPress, destructive, last }: {
  title: string; subtitle?: string | null; left?: ReactNode; right?: ReactNode; onPress?: () => void; destructive?: boolean; last?: boolean;
}) {
  const body = (
    <View style={[styles.row, !last && styles.rowLine]}>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, destructive && { color: colors.danger }]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Text style={styles.chev}>›</Text> : null)}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{body}</Pressable> : body;
}

/** iOS segmented control. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.segItem, value === o.key && styles.segOn]}
          accessibilityRole="tab" accessibilityState={{ selected: value === o.key }}>
          <Text style={[styles.segText, value === o.key && styles.segTextOn]} numberOfLines={1}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Button({ label, onPress, kind = "primary", busy, disabled, icon }: {
  label: string; onPress: () => void; kind?: "primary" | "danger" | "ghost"; busy?: boolean; disabled?: boolean; icon?: ReactNode;
}) {
  const bg = kind === "primary" ? colors.primary : "transparent";
  const fg = kind === "primary" ? "#fff" : kind === "danger" ? colors.danger : colors.primary;
  return (
    <Pressable onPress={onPress} disabled={busy || disabled} accessibilityRole="button"
      style={[styles.button, { backgroundColor: bg, borderColor: kind === "primary" ? bg : fg }, (busy || disabled) && { opacity: 0.5 }]}>
      {busy ? <ActivityIndicator color={fg} /> : (
        <View style={styles.buttonRow}>{icon}<Text style={[styles.buttonText, { color: fg }]}>{label}</Text></View>
      )}
    </Pressable>
  );
}

/** Width (px) from which the app switches to the desktop layout: sidebar nav, multi-column home. */
export const WIDE = 900;

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // centred column with a max width, so desktop browsers don't stretch content edge to edge
  // bottom padding clears the floating glass tab bar so the last row isn't hidden under it
  content: { padding: 16, gap: 12, paddingBottom: 130, width: "100%", maxWidth: 1100, alignSelf: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  label: { fontWeight: "600", color: colors.text },
  error: { color: colors.danger },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 8, borderWidth: 1, borderColor: colors.border,
    shadowColor: "#1f2a44", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  heading: { fontSize: 18, fontWeight: "800", color: colors.text, marginTop: 8 },
  muted: { color: colors.muted },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { color: colors.text },
  chipTextOn: { color: colors.primary, fontWeight: "600" },
  button: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  buttonRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  buttonText: { fontWeight: "600" },
  largeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  toolbarBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  groupLabel: { color: colors.muted, fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3, marginLeft: 16, marginTop: 10 },
  groupFooter: { color: colors.muted, fontSize: 13, marginHorizontal: 16 },
  group: { backgroundColor: colors.card, borderRadius: 14, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 52, paddingVertical: 10 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#d5dbe5" },
  rowTitle: { fontSize: 17, color: colors.text },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  chev: { fontSize: 22, color: "#b6bfcc" },
  seg: { flexDirection: "row", backgroundColor: "#e3e8f0", borderRadius: 10, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  segOn: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 13, fontWeight: "600", color: "#3c4658" },
  segTextOn: { color: colors.text },
});
