import { Platform } from "react-native";

export const AppTheme = {
  gradient: {
    colors: ["#0c1929", "#0f3d3e", "#134e4a", "#0c4a6e"] as const,
    locations: [0, 0.35, 0.7, 1] as const,
  },
  glass: {
    border: "rgba(255, 255, 255, 0.22)",
    borderStrong: "rgba(255, 255, 255, 0.35)",
    fill: "rgba(255, 255, 255, 0.12)",
    fillStrong: "rgba(255, 255, 255, 0.18)",
    blurIntensity: Platform.OS === "ios" ? 55 : 40,
    tint: "light" as const,
  },
  text: {
    primary: "#f8fafc",
    secondary: "rgba(248, 250, 252, 0.72)",
    muted: "rgba(248, 250, 252, 0.5)",
    onLight: "#0f172a",
    onLightMuted: "#64748b",
  },
  accent: {
    teal: "#14b8a6",
    tealDark: "#0d9488",
    indigo: "#6366f1",
  },
  status: {
    pumpOn: "#22c55e",
    pumpOff: "#64748b",
    error: "#fecaca",
    errorBg: "rgba(239, 68, 68, 0.2)",
  },
  tabBar: {
    active: "#5eead4",
    inactive: "rgba(248, 250, 252, 0.45)",
    background: Platform.OS === "ios" ? "transparent" : "rgba(12, 25, 41, 0.95)",
  },
  radius: {
    card: 20,
    button: 14,
    pill: 999,
  },
  shadow: Platform.select({
    ios: {
      card: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
    },
    default: {
      card: {
        elevation: 6,
      },
    },
  }),
};

const tintColorLight = AppTheme.accent.teal;
const tintColorDark = "#5eead4";

export const Colors = {
  light: {
    text: AppTheme.text.onLight,
    background: "#0c1929",
    tint: tintColorLight,
    icon: AppTheme.text.muted,
    tabIconDefault: AppTheme.tabBar.inactive,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: AppTheme.text.primary,
    background: "#0c1929",
    tint: tintColorDark,
    icon: AppTheme.text.muted,
    tabIconDefault: AppTheme.tabBar.inactive,
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
