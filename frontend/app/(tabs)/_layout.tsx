import { BlurView } from "expo-blur";
import { router, Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { AppTheme } from "@/constants/theme";

const TAB_BAR_BODY = 56;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_BODY + insets.bottom;

  return (
    <Tabs
      safeAreaInsets={{ top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right }}
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: AppTheme.tabBar.active,
        tabBarInactiveTintColor: AppTheme.tabBar.inactive,
        tabBarStyle: {
          position: "absolute",
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: insets.bottom,
          borderTopWidth: 1,
          borderTopColor: AppTheme.glass.border,
          backgroundColor: Platform.OS === "ios" ? "transparent" : AppTheme.tabBar.background,
          elevation: 0,
        },
        tabBarLabelStyle: styles.tabLabel,
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : undefined,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="drop.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="assistant"
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push("/chat");
          },
        }}
        options={{
          title: "Assistant",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="leaf.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
});
