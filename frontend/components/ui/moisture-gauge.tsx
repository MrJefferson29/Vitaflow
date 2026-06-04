import { StyleSheet, Text, View } from "react-native";

import { AppTheme } from "@/constants/theme";
import { MOISTURE_BANDS, getMoistureBand, type MoistureBand } from "@/lib/moisture";

type MoistureGaugeProps = {
  level: number | null | undefined;
  loading?: boolean;
};

export function MoistureGauge({ level, loading }: MoistureGaugeProps) {
  const band = getMoistureBand(level);
  const display = level != null && Number.isFinite(level) ? Math.round(level) : null;

  return (
    <View style={styles.root}>
      <View style={[styles.ringOuter, { shadowColor: band.glow, borderColor: band.primary }]}>
        <View style={[styles.ringInner, { borderColor: `${band.primary}66` }]}>
          <Text style={[styles.percent, { color: band.primary }]}>
            {loading && display == null ? "—" : display != null ? `${display}` : "—"}
          </Text>
          <Text style={styles.percentSign}>%</Text>
        </View>
      </View>

      <View style={[styles.badge, { backgroundColor: `${band.primary}33`, borderColor: band.primary }]}>
        <View style={[styles.badgeDot, { backgroundColor: band.primary }]} />
        <Text style={[styles.badgeText, { color: band.secondary }]}>{band.shortLabel}</Text>
      </View>

      <Text style={styles.hint}>{band.hint}</Text>

      <View style={styles.legend}>
        {MOISTURE_BANDS.map((b) => (
          <LegendSegment key={b.id} band={b} active={band.id === b.id && display != null} level={display} />
        ))}
      </View>
    </View>
  );
}

function LegendSegment({
  band,
  active,
  level,
}: {
  band: MoistureBand;
  active: boolean;
  level: number | null;
}) {
  const inRange = level != null && level >= band.min && level <= band.max;

  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendBar,
          { backgroundColor: band.primary },
          (active || inRange) && styles.legendBarActive,
          (active || inRange) && { shadowColor: band.primary },
        ]}
      />
      <Text style={[styles.legendLabel, (active || inRange) && { color: band.secondary }]}>
        {band.min}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    gap: 14,
    paddingVertical: 8,
  },
  ringOuter: {
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  ringInner: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.15)",
  },
  percent: {
    fontSize: 52,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: -2,
  },
  percentSign: {
    fontSize: 22,
    fontWeight: "600",
    color: AppTheme.text.secondary,
    marginTop: 14,
    marginLeft: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: AppTheme.radius.pill,
    borderWidth: 1,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  hint: {
    fontSize: 14,
    color: AppTheme.text.secondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  legend: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    width: "100%",
    paddingTop: 8,
  },
  legendItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  legendBar: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    opacity: 0.45,
  },
  legendBarActive: {
    height: 10,
    opacity: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  legendLabel: {
    fontSize: 9,
    color: AppTheme.text.muted,
    fontWeight: "600",
  },
});
