import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { AppTheme } from "@/constants/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: AppTheme.tabBar.active,
        tabBarInactiveTintColor: AppTheme.tabBar.inactive,
        tabBarStyle: styles.tabBar,
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
          title: "Tasks",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Assistant",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="leaf.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    borderTopWidth: 1,
    borderTopColor: AppTheme.glass.border,
    backgroundColor: Platform.OS === "ios" ? "transparent" : AppTheme.tabBar.background,
    height: Platform.OS === "ios" ? 88 : 64,
    paddingTop: 8,
    elevation: 0,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
});
