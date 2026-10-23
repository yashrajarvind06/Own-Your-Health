import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import RecordTimeline from "@/components/RecordTimeline";
import { LargeTitle, ToolbarButton } from "@/components/ui";
import { colors } from "@/lib/theme";

export default function Records() {
  return (
    <RecordTimeline
      header={
        <LargeTitle
          title="Records"
          action={<ToolbarButton label="Add record" onPress={() => router.push("/upload")} icon={<Ionicons name="add" size={26} color={colors.primary} />} />}
        />
      }
    />
  );
}
