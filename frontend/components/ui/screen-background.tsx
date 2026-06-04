import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type ViewProps } from "react-native";

import { AppTheme } from "@/constants/theme";

type ScreenBackgroundProps = ViewProps & {
  children: React.ReactNode;
};

export function ScreenBackground({ children, style, ...rest }: ScreenBackgroundProps) {
  return (
    <View style={[styles.root, style]} {...rest}>
      <LinearGradient
        colors={[...AppTheme.gradient.colors]}
        locations={[...AppTheme.gradient.locations]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={styles.orbTop} />
      <View style={styles.orbBottom} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: AppTheme.gradient.colors[0],
  },
  orbTop: {
    position: "absolute",
    top: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(94, 234, 212, 0.12)",
  },
  orbBottom: {
    position: "absolute",
    bottom: 120,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
  },
});
