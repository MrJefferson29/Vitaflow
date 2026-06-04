import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";

import { AppTheme } from "@/constants/theme";

type GlassCardProps = ViewProps & {
  children: React.ReactNode;
  intensity?: number;
  prominent?: boolean;
  contentStyle?: ViewStyle;
};

export function GlassCard({
  children,
  style,
  contentStyle,
  intensity = AppTheme.glass.blurIntensity,
  prominent = false,
  ...rest
}: GlassCardProps) {
  const borderColor = prominent ? AppTheme.glass.borderStrong : AppTheme.glass.border;
  const fill = prominent ? AppTheme.glass.fillStrong : AppTheme.glass.fill;

  return (
    <View style={[styles.wrapper, AppTheme.shadow?.card, style]} {...rest}>
      {Platform.OS === "ios" ? (
        <BlurView intensity={intensity} tint={AppTheme.glass.tint} style={StyleSheet.absoluteFill} />
      ) : null}
      <View
        style={[
          styles.fill,
          { backgroundColor: Platform.OS === "ios" ? fill : "rgba(255, 255, 255, 0.14)" },
          { borderColor },
        ]}>
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: AppTheme.radius.card,
    overflow: "hidden",
  },
  fill: {
    borderWidth: 1,
    borderRadius: AppTheme.radius.card,
    overflow: "hidden",
  },
  content: {
    padding: 18,
    gap: 10,
  },
});
