import * as Haptics from "expo-haptics";
import { Platform, Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { AppTheme } from "@/constants/theme";

type PrimaryButtonProps = Omit<PressableProps, "children"> & {
  label: string;
  variant?: "primary" | "danger" | "ghost";
  buttonStyle?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  label,
  variant = "primary",
  onPress,
  disabled,
  buttonStyle,
  ...rest
}: PrimaryButtonProps) {
  const handlePress: PressableProps["onPress"] = (e) => {
    if (Platform.OS === "ios" && !disabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.(e);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "danger" && styles.danger,
        variant === "ghost" && styles.ghost,
        pressed && styles.pressed,
        disabled && styles.disabled,
        buttonStyle,
      ]}
      {...rest}>
      <Text style={[styles.label, variant === "ghost" && styles.labelGhost]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: AppTheme.radius.button,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: AppTheme.accent.teal,
  },
  danger: {
    backgroundColor: "#dc2626",
  },
  ghost: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: AppTheme.glass.border,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  labelGhost: {
    color: AppTheme.text.primary,
  },
});
