import { useCallback, useState } from "react";
import { ScrollView, Text } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { Button, Card, Muted, ui } from "@/components/ui";

type Deleted = { id: number; record_type: string; record_date: string; one_line_summary: string; deleted_at: string };

/** docx "backup of deleted docs": deleted records stay restorable. */
export default function DeletedRecords() {
  const { request } = useSession();
  const [items, setItems] = useState<Deleted[]>([]);
  const load = useCallback(() => { request<Deleted[]>("/reports/deleted").then(setItems).catch(() => {}); }, [request]);
  useFocusEffect(load);

  const restore = async (id: number) => {
    await request(`/reports/${id}/restore`, { method: "POST", body: "{}" });
    load();
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Stack.Screen options={{ title: "Deleted records" }} />
      {items.length === 0 && <Muted>Nothing here. Deleted records appear here and can be restored.</Muted>}
      {items.map((r) => (
        <Card key={r.id}>
          <Text style={{ fontWeight: "700", color: colors.text }}>{r.record_type} · {new Date(r.record_date).toLocaleDateString()}</Text>
          <Muted>{r.one_line_summary}</Muted>
          <Button label="Restore" kind="ghost" onPress={() => restore(r.id)} />
        </Card>
      ))}
    </ScrollView>
  );
}
