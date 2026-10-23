import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import HistoryList from "@/components/HistoryList";
import { ui } from "@/components/ui";

export default function History() {
  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Stack.Screen options={{ title: "Access history" }} />
      <HistoryList />
    </ScrollView>
  );
}
