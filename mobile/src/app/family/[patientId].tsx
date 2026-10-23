import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import AccessPanel from "@/components/AccessPanel";
import RecordTimeline from "@/components/RecordTimeline";
import SummaryCard from "@/components/SummaryCard";
import { Button, Card, Chip, Muted, ui } from "@/components/ui";

type Link = { patient_id: number; patient_name: string | null; relation: string; permissions: string[] };
type Emergency = Record<string, string | number | null>;

const TABS = [
  { key: "VIEW_RECORDS", label: "Records" },
  { key: "APPROVE_ACCESS", label: "Doctor access" },
  { key: "EMERGENCY", label: "Emergency" },
];

/** Acting for a family member: only the parts their permissions allow are shown (the API enforces it too). */
export default function CaringFor() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const id = Number(patientId);
  const { request } = useSession();
  const [link, setLink] = useState<Link | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [emergency, setEmergency] = useState<Emergency | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request<Link[]>("/family/caring-for").then((links) => {
      const l = links.find((x) => x.patient_id === id) ?? null;
      setLink(l);
      setTab(TABS.find((t) => l?.permissions.includes(t.key))?.key ?? null);
    }).catch((e) => setError(e.message));
  }, [request, id]);

  useEffect(() => {
    if (tab === "EMERGENCY") request<Emergency>(`/family/emergency/${id}`).then(setEmergency).catch((e) => setError(e.message));
  }, [tab, request, id]);

  const title = link?.patient_name ?? "Family member";
  if (!link) {
    return (
      <View style={[ui.screen, ui.content]}>
        <Stack.Screen options={{ title }} />
        <Muted>{error ?? "Loading…"}</Muted>
      </View>
    );
  }

  const tabs = TABS.filter((t) => link.permissions.includes(t.key));
  const tabBar = (
    <View style={{ gap: 8 }}>
      <Muted>Acting as {title}'s {link.relation.toLowerCase()}. Your actions are logged and visible to them.</Muted>
      <View style={ui.wrap}>{tabs.map((t) => <Chip key={t.key} label={t.label} on={tab === t.key} onPress={() => setTab(t.key)} />)}</View>
      {link.permissions.includes("UPLOAD") && (
        <Button label={`Upload for ${title}`} kind="ghost" icon={<Ionicons name="cloud-upload" size={18} color={colors.primary} />}
          onPress={() => router.push({ pathname: "/upload", params: { patientId: String(id) } })} />
      )}
    </View>
  );

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ title }} />
      {tab === "VIEW_RECORDS" && <RecordTimeline patientId={id} header={<>{tabBar}<SummaryCard patientId={id} /></>} />}
      {tab === "APPROVE_ACCESS" && (
        <AccessPanel patientId={id} header={tabBar} />
      )}
      {(tab === "EMERGENCY" || tab === null) && (
        <ScrollView contentContainerStyle={ui.content}>
          {tabBar}
          {tab === null && <Muted>Upload is the only thing you can do for {title}.</Muted>}
          {emergency && (
            <Card>
              {Object.entries(emergency).filter(([, v]) => v !== null && v !== "").map(([k, v]) => (
                <View key={k} style={styles.row}>
                  <Text style={styles.key}>{k.replace(/_/g, " ")}</Text>
                  <Text style={[styles.val, k === "allergies" && { color: colors.danger }]}>{String(v)}</Text>
                </View>
              ))}
            </Card>
          )}
          {error && <Text style={ui.error}>{error}</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  key: { width: 130, color: colors.muted, fontWeight: "600", textTransform: "capitalize" },
  val: { flex: 1, color: colors.text },
});
