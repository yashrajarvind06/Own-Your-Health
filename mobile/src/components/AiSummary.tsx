import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";

export type AiValue = { name: string; value: string; unit?: string | null; target?: string | null; status: "normal" | "high" | "low" | "abnormal" };
export type AiDetails = { summary: string; values: AiValue[]; takeaways: string[]; discuss: string[] };

const STATUS: Record<AiValue["status"], { label: string; color: string }> = {
  normal: { label: "Normal", color: colors.ok },
  high: { label: "High", color: colors.danger },
  low: { label: "Low", color: colors.warn },
  abnormal: { label: "Abnormal", color: colors.danger },
};

/** Purple label on everything the AI wrote, so it is never mistaken for the document itself. */
export function AiChip({ label = "AI summary" }: { label?: string }) {
  return (
    <View style={styles.chip} accessibilityLabel={label}>
      <Ionicons name="sparkles" size={12} color={colors.ai} />
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

export function StatusPill({ status }: { status: AiValue["status"] }) {
  const s = STATUS[status] ?? STATUS.abnormal;
  return <Text style={[styles.pill, { color: s.color, backgroundColor: s.color + "16" }]}>{s.label}</Text>;
}

/** The first out-of-range value, for the record row ("HbA1c 7.8% · High"). */
export const flagged = (d?: AiDetails | null) => d?.values?.find((v) => v.status !== "normal") ?? null;

function List({ icon, title, items, tint }: { icon: keyof typeof Ionicons.glyphMap; title: string; items: string[]; tint: string }) {
  if (!items?.length) return null;
  return (
    <View style={[styles.card, { backgroundColor: tint }]}>
      <View style={styles.cardHead}><Ionicons name={icon} size={18} color={colors.primary} /><Text style={styles.cardTitle}>{title}</Text></View>
      {items.map((t, i) => <Text key={i} style={styles.bullet}>•  {t}</Text>)}
    </View>
  );
}

/** A record's AI summary: paragraph, measured values, key takeaways, things to ask the doctor. */
export function AiDetailsView({ details }: { details: AiDetails }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <AiChip />
        <Text style={styles.body}>{details.summary}</Text>
      </View>
      {details.values?.length > 0 && (
        <View style={styles.tiles}>
          {details.values.map((v, i) => (
            <View key={i} style={styles.tile}>
              <Text style={styles.tileName} numberOfLines={2}>{v.name}</Text>
              <Text style={styles.tileValue}>{v.value}<Text style={styles.tileUnit}> {v.unit ?? ""}</Text></Text>
              {!!v.target && <Text style={styles.tileTarget} numberOfLines={2}>Target: {v.target}</Text>}
              <View style={{ flexDirection: "row", marginTop: 4 }}><StatusPill status={v.status} /></View>
            </View>
          ))}
        </View>
      )}
      <List icon="bulb-outline" title="Key takeaways" items={details.takeaways} tint={colors.primarySoft} />
      <List icon="chatbubbles-outline" title="To discuss with your doctor" items={details.discuss} tint={colors.aiSoft} />
      <Text style={styles.foot}>Written by AI from this document. It can make mistakes and is not medical advice.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: colors.aiSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { color: colors.ai, fontSize: 12, fontWeight: "700" },
  pill: { fontSize: 12, fontWeight: "700", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  card: { borderRadius: 16, padding: 14, gap: 8 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  body: { fontSize: 16, lineHeight: 23, color: colors.text },
  bullet: { fontSize: 15, lineHeight: 21, color: colors.text },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { flexGrow: 1, flexBasis: "30%", minWidth: 100, backgroundColor: colors.card, borderRadius: 14, padding: 12, gap: 2 },
  tileName: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  tileValue: { color: colors.text, fontSize: 20, fontWeight: "800" },
  tileUnit: { fontSize: 13, fontWeight: "600", color: colors.muted },
  tileTarget: { color: colors.muted, fontSize: 12 },
  foot: { color: colors.muted, fontSize: 13, textAlign: "center", paddingHorizontal: 12 },
});
