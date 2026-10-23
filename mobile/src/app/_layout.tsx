import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider, useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </SessionProvider>
  );
}

function RootNavigator() {
  const { token, isLoading } = useSession();
  if (isLoading) return null; // wait for the stored token before choosing a screen

  return (
    <Stack screenOptions={{
      headerTintColor: colors.primary,
      headerStyle: { backgroundColor: colors.bg },
      headerShadowVisible: false,
      headerTitleStyle: { color: colors.text, fontWeight: "700" },
    }}>
      {/* Every signed-in route must be listed here; unlisted routes are reachable while signed out */}
      <Stack.Protected guard={!!token}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen name="upload" options={{ title: "Upload record", presentation: "modal" }} />
        <Stack.Screen name="trends" options={{ title: "Health trends" }} />
        <Stack.Screen name="history" options={{ title: "Access history" }} />
        <Stack.Screen name="deleted" options={{ title: "Deleted records" }} />
        <Stack.Screen name="family/index" options={{ title: "Family & caregivers" }} />
        <Stack.Screen name="family-add" options={{ title: "Add family member" }} />
        <Stack.Screen name="family/[patientId]" options={{ title: "Family member" }} />
        <Stack.Screen name="share" options={{ title: "Share records" }} />
        <Stack.Screen name="assistant" options={{ title: "Ask about my records" }} />
        <Stack.Screen name="doctors" options={{ title: "Find doctors" }} />
      </Stack.Protected>
      <Stack.Protected guard={!token}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* Listed last so it's never the fallback route when the user signs out */}
      <Stack.Screen name="emergency" options={{ title: "Emergency card" }} />
      {/* Public: a doctor opens a patient's share link without an account */}
      <Stack.Screen name="s/[token]" options={{ title: "Shared health records" }} />
    </Stack>
  );
}
