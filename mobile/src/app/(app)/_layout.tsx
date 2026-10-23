import { useCallback, useState } from "react";
import { Tabs, useFocusEffect } from "expo-router";
import { useWindowDimensions } from "react-native";
import { useSession } from "@/lib/session";
import GlassTabBar from "@/components/GlassTabBar";
import { WIDE } from "@/components/ui";

export default function AppTabs() {
  const { request } = useSession();
  const wide = useWindowDimensions().width >= WIDE;
  const [attention, setAttention] = useState(0);

  // Badge on Access = pending doctor requests + unseen misuse alerts (tab-bars.md: badges for critical info only)
  useFocusEffect(useCallback(() => {
    const load = () => Promise.all([
      request<unknown[]>("/access/requests/pending").catch(() => []),
      request<{ seen: boolean }[]>("/alerts").catch(() => []),
    ]).then(([p, a]) => setAttention(p.length + a.filter((x) => !x.seen).length));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [request]));

  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: wide ? "left" : "bottom" }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="records" options={{ title: "Records" }} />
      <Tabs.Screen name="access" options={{ title: "Access", tabBarBadge: attention || undefined }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
