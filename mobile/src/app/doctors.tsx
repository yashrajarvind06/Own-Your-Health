import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { colors, purposeLabel } from "@/lib/theme";
import { Button, Card, Chip, Heading, Muted, ui } from "@/components/ui";

type Doctor = {
  id: number; name: string; hpr_id: string | null; specialization: string | null; hospital: string | null;
  experience: number; qualification: string | null; verified: boolean; trust_score?: number;
};

/** Patient-initiated access: find an HPR-verified doctor and invite them to see your records (they accept on their side). */
export default function FindDoctors() {
  const { request } = useSession();
  const [q, setQ] = useState("");
  const [top, setTop] = useState<Doctor[]>([]);
  const [others, setOthers] = useState<Doctor[]>([]);
  const [purpose, setPurpose] = useState("TREATMENT");
  const [sent, setSent] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      request<{ top_doctors: Doctor[]; other_doctors: Doctor[] }>(`/doctors/search?q=${encodeURIComponent(q)}`)
        .then((r) => { setTop(r.top_doctors); setOthers(r.other_doctors); })
        .catch((e) => setError(e.message));
    }, 300); // debounce typing
    return () => clearTimeout(t);
  }, [q, request]);

  const invite = async (id: number) => {
    setError(null);
    try {
      await request("/access/request-direct", { method: "POST", body: JSON.stringify({ doctor_id: id, reason: purpose }) });
      setSent((s) => [...s, id]);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const card = (d: Doctor) => (
    <Card key={d.id}>
      <View style={styles.top}>
        <Text style={styles.name}>{d.name}</Text>
        {d.verified && <Text style={styles.verified}><Ionicons name="shield-checkmark" size={13} /> HPR verified</Text>}
      </View>
      {d.verified && <Muted>{[d.specialization, d.hospital, d.experience ? `${d.experience} yrs` : null].filter(Boolean).join(" · ")}</Muted>}
      {d.trust_score !== undefined && <Text style={{ color: colors.text }}>Trust score <Text style={{ fontWeight: "700" }}>{d.trust_score}/100</Text></Text>}
      <View style={{ alignItems: "flex-end" }}>
        {sent.includes(d.id) ? <Muted>Invite sent — waiting for the doctor</Muted> : (
          <Button label="Invite to my records" onPress={() => invite(d.id)} disabled={!d.verified} />
        )}
      </View>
    </Card>
  );

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Find doctors" }} />
      <TextInput style={ui.input} value={q} onChangeText={setQ} placeholder="Search doctors by name" accessibilityLabel="Search doctors" />
      <Text style={ui.label}>Purpose of the invite</Text>
      <View style={ui.wrap}>
        {Object.entries(purposeLabel).map(([k, v]) => <Chip key={k} label={v} on={purpose === k} onPress={() => setPurpose(k)} />)}
      </View>
      {error && <Text style={ui.error}>{error}</Text>}
      <Heading>Verified doctors</Heading>
      {top.length === 0 && <Muted>No verified doctors match.</Muted>}
      {top.map(card)}
      {others.length > 0 && (
        <>
          <Heading>Not yet verified</Heading>
          <Muted>Only HPR-verified doctors can be invited.</Muted>
          {others.map(card)}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { fontSize: 16, fontWeight: "700", color: colors.text, flexShrink: 1 },
  verified: { color: colors.ok, fontWeight: "600", fontSize: 12 },
});
