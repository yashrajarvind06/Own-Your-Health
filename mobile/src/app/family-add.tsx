import { useState } from "react";
import { ScrollView, Switch, Text, TextInput, View } from "react-native";
import { router, Stack } from "expo-router";
import { useSession } from "@/lib/session";
import { colors, PERMISSIONS } from "@/lib/theme";
import { Button, Card, Chip, Group, Muted, Row, ui } from "@/components/ui";

const RELATIONS = ["Son", "Daughter", "Spouse", "Parent", "Grandson", "Granddaughter", "Sibling", "Caregiver", "Other"];
const DURATIONS = [{ label: "Permanent", days: null }, { label: "7 days", days: 7 }, { label: "30 days", days: 30 }, { label: "90 days", days: 90 }];

/** docx family mode: name, relation, mobile -> OTP to that person -> choose what to share -> how long. */
export default function AddFamilyMember() {
  const { request } = useSession();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("Son");
  const [phone, setPhone] = useState("");
  const [permissions, setPermissions] = useState<string[]>(["EMERGENCY"]);
  const [primary, setPrimary] = useState(false);
  const [days, setDays] = useState<number | null>(null);
  const [pending, setPending] = useState<{ id: number; sent_to: string; dev_otp?: string } | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const add = () => run(async () => {
    const res = await request<{ member: { id: number }; sent_to: string; dev_otp?: string }>("/family/members", {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), relation, phone, permissions, is_primary_caregiver: primary, duration_days: days }),
    });
    setPending({ id: res.member.id, sent_to: res.sent_to, dev_otp: res.dev_otp });
  });

  const verify = () => run(async () => {
    await request(`/family/members/${pending!.id}/verify`, { method: "POST", body: JSON.stringify({ code: otp.trim() }) });
    router.back();
  });

  if (pending) {
    return (
      <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
        <Stack.Screen options={{ title: "Verify family member" }} />
        <Card>
          <Text style={ui.label}>Ask {name} for the OTP sent to {pending.sent_to}</Text>
          {pending.dev_otp && <Muted>Demo OTP: {pending.dev_otp}</Muted>}
          <TextInput style={ui.input} value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6}
            placeholder="6-digit OTP" placeholderTextColor="#6e7891" accessibilityLabel="OTP" autoFocus />
          <Muted>This confirms you're linking the right person.</Muted>
        </Card>
        {error && <Text style={ui.error}>{error}</Text>}
        <Button label="Verify & link" onPress={verify} busy={busy} disabled={otp.length !== 6} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Add family member" }} />
      <Card>
        <Text style={ui.label}>Name</Text>
        <TextInput style={ui.input} value={name} onChangeText={setName} placeholder="e.g. Rahul Singh" placeholderTextColor="#6e7891" accessibilityLabel="Name" />
        <Text style={ui.label}>Relation</Text>
        <View style={ui.wrap}>{RELATIONS.map((r) => <Chip key={r} label={r} on={relation === r} onPress={() => setRelation(r)} />)}</View>
        <Text style={ui.label}>Mobile number</Text>
        <TextInput style={ui.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10-digit mobile" placeholderTextColor="#6e7891" accessibilityLabel="Mobile number" />
      </Card>
      <Group label="What can they do?" footer="They can do only what's switched on. Everything they do is recorded.">
        {PERMISSIONS.map((p) => (
          <Row key={p.key} title={p.label}
            right={<Switch value={permissions.includes(p.key)} accessibilityLabel={p.label}
              onValueChange={(on) => setPermissions(on ? [...permissions, p.key] : permissions.filter((x) => x !== p.key))} />} />
        ))}
        <Row title="Primary caregiver" last right={<Switch value={primary} onValueChange={setPrimary} accessibilityLabel="Primary caregiver" />} />
      </Group>
      <Card>
        <Text style={ui.label}>For how long?</Text>
        <View style={ui.wrap}>{DURATIONS.map((d) => <Chip key={d.label} label={d.label} on={days === d.days} onPress={() => setDays(d.days)} />)}</View>
        <Muted>You can remove them anytime. Access stops instantly.</Muted>
      </Card>
      {error && <Text style={ui.error}>{error}</Text>}
      <Button label="Send OTP" onPress={add} busy={busy} disabled={!name.trim() || phone.length < 10 || permissions.length === 0} />
    </ScrollView>
  );
}
