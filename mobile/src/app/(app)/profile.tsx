import { useCallback, useState } from "react";
import { ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { Button, Group, LargeTitle, Muted, Row, ui } from "@/components/ui";

type Profile = {
  id: number; display_name: string | null; email: string; phone: string | null; phone_verified: boolean;
  abha_number: string | null; abha_address: string | null; abha_verified: boolean; health_alerts_enabled: boolean;
};

const Icon = ({ name, bg, color = "#fff" }: { name: keyof typeof Ionicons.glyphMap; bg: string; color?: string }) => (
  <View style={[styles.icon, { backgroundColor: bg }]}><Ionicons name={name} size={17} color={color} /></View>
);

/** Settings-style profile: identity, family, privacy, records, sign out. */
export default function ProfileScreen() {
  const { request, signOut } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [family, setFamily] = useState({ helpers: 0, caring: 0 });
  const [abha, setAbha] = useState("");
  const [otp, setOtp] = useState("");
  const [otpInfo, setOtpInfo] = useState<{ sent_to: string; dev_otp?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    request<Profile>("/user/me/profile").then(setProfile).catch(() => {});
    Promise.all([request<unknown[]>("/family/members").catch(() => []), request<unknown[]>("/family/caring-for").catch(() => [])])
      .then(([h, c]) => setFamily({ helpers: h.length, caring: c.length }));
  }, [request]);
  useFocusEffect(load);

  const linkAbha = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!otpInfo) setOtpInfo(await request("/user/me/abha", { method: "POST", body: JSON.stringify({ abha_number: abha }) }));
      else {
        await request("/user/me/abha", { method: "POST", body: JSON.stringify({ abha_number: abha, code: otp }) });
        setOtpInfo(null);
        load();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleAlerts = async (on: boolean) => {
    setProfile((p) => (p ? { ...p, health_alerts_enabled: on } : p));
    await request("/user/me/settings", { method: "PUT", body: JSON.stringify({ health_alerts_enabled: on }) }).catch(() => load());
  };

  const exportFhir = async () => {
    const bundle = await request(`/fhir/Patient/${profile!.id}/$everything`);
    await Share.share({ title: "My health records (FHIR)", message: JSON.stringify(bundle, null, 2) }).catch(() => {});
  };

  const name = profile?.display_name ?? "";
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "Me";
  const familySub = family.helpers || family.caring
    ? [family.helpers && `${family.helpers} helping you`, family.caring && `you care for ${family.caring}`].filter(Boolean).join(" · ")
    : "Let a family member help manage your health";

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.content, { maxWidth: 760 }]} keyboardShouldPersistTaps="handled">
      <LargeTitle title="Profile" />
      {profile && (
        <>
          <View style={styles.head}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{name || "Your profile"}</Text>
              <Text style={styles.sub}>
                {profile.abha_verified ? `ABHA ${profile.abha_number} · ✓ Verified` : profile.phone ? `+91 ${profile.phone}${profile.phone_verified ? " · verified" : ""}` : `Patient ID ${profile.id}`}
              </Text>
            </View>
          </View>

          <Group label="Identity" footer={profile.abha_verified ? "Your records are linked to your government health ID." : "Link your ABHA so doctors and hospitals know your records are really yours."}>
            {profile.abha_verified ? (
              <>
                <Row title="ABHA number" left={<Icon name="shield-checkmark" bg={colors.ok} />} right={<Text style={styles.value}>{profile.abha_number}</Text>} />
                <Row title="ABHA address" left={<Icon name="at" bg="#5e35b1" />} right={<Text style={styles.value}>{profile.abha_address}</Text>} last />
              </>
            ) : (
              <View style={styles.linkBox}>
                <TextInput style={ui.input} value={abha} onChangeText={setAbha} placeholder="14-digit ABHA number" placeholderTextColor="#6e7891"
                  keyboardType="number-pad" editable={!otpInfo} accessibilityLabel="ABHA number" />
                {otpInfo && (
                  <>
                    <Muted>OTP sent to {otpInfo.sent_to}{otpInfo.dev_otp ? ` (Demo OTP: ${otpInfo.dev_otp})` : ""}</Muted>
                    <TextInput style={ui.input} value={otp} onChangeText={setOtp} placeholder="6-digit OTP" placeholderTextColor="#6e7891" keyboardType="number-pad"
                      maxLength={6} accessibilityLabel="OTP" autoComplete="sms-otp" textContentType="oneTimeCode" />
                  </>
                )}
                {error && <Text style={ui.error}>{error}</Text>}
                <Button label={otpInfo ? "Verify & Link" : "Link ABHA"} onPress={linkAbha} busy={busy} disabled={!abha || (!!otpInfo && otp.length !== 6)} />
              </View>
            )}
          </Group>

          <Group label="Health" footer="A short history from your reports that you can share with a doctor.">
            <Row title="Health history" subtitle="AI summary of your records" left={<Icon name="sparkles" bg={colors.ai} />} onPress={() => router.push("/health-history")} last />
          </Group>

          <Group label="Family">
            <Row title="Family & caregivers" subtitle={familySub} left={<Icon name="people" bg="#ad1457" />} onPress={() => router.push("/family")} last />
          </Group>

          <Group label="Privacy">
            <Row title="Health pattern alerts" subtitle="e.g. “BP values increasing” — never a diagnosis" left={<Icon name="trending-up" bg={colors.warn} />}
              right={<Switch value={profile.health_alerts_enabled} onValueChange={toggleAlerts} accessibilityLabel="Health pattern alerts" />} />
            <Row title="Access history" left={<Icon name="time" bg="#455a64" />} onPress={() => router.push("/history")} />
            <Row title="Export my records" subtitle="FHIR file you can take anywhere" left={<Icon name="share-outline" bg={colors.primary} />} onPress={exportFhir} last />
          </Group>

          <Group label="Records">
            <Row title="Recently deleted" left={<Icon name="trash" bg="#78909c" />} onPress={() => router.push("/deleted")} />
            <Row title="Emergency card" left={<Icon name="medkit" bg={colors.danger} />} onPress={() => router.push("/emergency")} last />
          </Group>

          <Group>
            <Row title="Sign Out" destructive onPress={signOut} right={<View />} last />
          </Group>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.card, borderRadius: 14, padding: 16 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontSize: 22, fontWeight: "800" },
  name: { fontSize: 22, fontWeight: "700", color: colors.text },
  sub: { color: colors.muted, fontSize: 15, marginTop: 2 },
  icon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  value: { color: colors.muted, fontSize: 15 },
  linkBox: { padding: 14, gap: 10 },
});
