import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";
import { Card } from "./ui";

// India: 108 = ambulance, 112 = national emergency line. Calls work without internet.
const CALLS = [
  { label: "Ambulance", number: "108", icon: "call" },
  { label: "Emergency", number: "112", icon: "alert-circle" },
] as const;

// Maps asks for location permission itself and searches around the user (docx: nearby ambulance, blood bank, hospitals).
const PLACES = [
  { label: "Hospitals", query: "hospital", icon: "business" },
  { label: "Blood banks", query: "blood bank", icon: "water" },
  { label: "Pharmacies", query: "pharmacy", icon: "medkit" },
] as const;

const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${q} near me`)}`;

export default function NearbyHelp() {
  return (
    <Card>
      <Text style={styles.title}>Get help now</Text>
      <View style={styles.row}>
        {CALLS.map((c) => (
          <Pressable key={c.number} style={[styles.btn, styles.call]} onPress={() => Linking.openURL(`tel:${c.number}`)}
            accessibilityRole="button" accessibilityLabel={`Call ${c.label} ${c.number}`}>
            <Ionicons name={c.icon} size={20} color="#fff" />
            <Text style={styles.callText}>{c.label} {c.number}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        {PLACES.map((p) => (
          <Pressable key={p.query} style={styles.btn} onPress={() => Linking.openURL(mapsUrl(p.query))}
            accessibilityRole="button" accessibilityLabel={`Find ${p.label} near me`}>
            <Ionicons name={p.icon} size={20} color={colors.primary} />
            <Text style={styles.placeText}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  call: { backgroundColor: colors.danger, borderColor: colors.danger, flexDirection: "row", justifyContent: "center", gap: 6 },
  callText: { color: "#fff", fontWeight: "700" },
  placeText: { color: colors.text, fontWeight: "600", fontSize: 13 },
});
