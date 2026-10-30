import { useCallback, useEffect, useRef, useState } from "react";
import { router, Tabs, useFocusEffect } from "expo-router";
import { useWindowDimensions } from "react-native";
import { useSession } from "@/lib/session";
import GlassTabBar from "@/components/GlassTabBar";
import { RequestPopup, type RequestItem } from "@/components/HomeLive";
import { WIDE } from "@/components/ui";

export default function AppTabs() {
  const { request, newUser, clearNewUser } = useSession();
  const wide = useWindowDimensions().width >= WIDE;
  const [attention, setAttention] = useState(0);
  const [popup, setPopup] = useState<RequestItem | null>(null);
  const popped = useRef(new Set<number>()); // each request pops up once per app session

  // Badge on Access = pending doctor requests + unseen misuse alerts (tab-bars.md: badges for critical info only).
  // Polled every 10 s on every tab, so a doctor's new request pops up wherever the patient is.
  useFocusEffect(useCallback(() => {
    const load = () => Promise.all([
      request<RequestItem[]>("/access/requests/pending").catch(() => [] as RequestItem[]),
      request<{ seen: boolean }[]>("/alerts").catch(() => []),
    ]).then(([p, a]) => {
      setAttention(p.length + a.filter((x) => !x.seen).length);
      const fresh = p.find((x) => !popped.current.has(x.id));
      if (fresh) { popped.current.add(fresh.id); setPopup(fresh); }
    });
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [request]));

  // Fresh sign-ups land on the (skippable) profile step once
  useEffect(() => {
    if (!newUser) return;
    clearNewUser();
    setTimeout(() => router.push("/complete-profile")); // after this first render, once navigation is mounted
  }, [newUser, clearNewUser]);

  const deny = async () => {
    const id = popup?.id;
    setPopup(null);
    if (id) await request(`/access/deny?request_id=${id}`, { method: "POST", body: "{}" }).catch(() => {});
    setAttention((n) => Math.max(0, n - 1));
  };

  return (
    <>
      <Tabs
        tabBar={(props) => <GlassTabBar {...props} />}
        screenOptions={{ headerShown: false, tabBarPosition: wide ? "left" : "bottom" }}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="records" options={{ title: "Records" }} />
        <Tabs.Screen name="access" options={{ title: "Access", tabBarBadge: attention || undefined }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
      <RequestPopup req={popup} onDeny={deny} onLater={() => setPopup(null)}
        onReview={() => { const id = popup!.id; setPopup(null); router.navigate({ pathname: "/access", params: { review: String(id) } }); }} />
    </>
  );
}
