import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassCard } from "@/components/ui/glass-card";
import { MoistureGauge } from "@/components/ui/moisture-gauge";
import { PrimaryButton } from "@/components/ui/primary-button";
import { ScreenBackground } from "@/components/ui/screen-background";
import { SectionHeader } from "@/components/ui/section-header";
import { AppTheme } from "@/constants/theme";
import { getMoistureBand } from "@/lib/moisture";
import { api, IrrigationStatus } from "@/lib/api";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<IrrigationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setError(null);
      const next = await api.getStatus();
      setStatus(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to fetch system status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadStatus();
    }, [loadStatus]),
  );

  const togglePump = async () => {
    if (!status) {
      return;
    }
    try {
      setToggling(true);
      setError(null);
      const nextPump = !Boolean(status.pumpOn);
      const result = await api.setPump(nextPump);
      setStatus((prev) =>
        prev ? { ...prev, pumpOn: Boolean(result.pumpOn) } : prev,
      );
      await new Promise((r) => setTimeout(r, 600));
      await loadStatus();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update pump.");
    } finally {
      setToggling(false);
    }
  };

  const moistureBand = getMoistureBand(status?.moistureLevel);
  const pumpOn = Boolean(status?.pumpOn);

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + (Platform.OS === "ios" ? 8 : 16),
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadStatus}
            tintColor={AppTheme.accent.teal}
          />
        }>
        <SectionHeader
          title="Irrigation"
          subtitle="Live soil moisture from your ESP32 sensor. Pull down to refresh."
        />

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <GlassCard prominent contentStyle={styles.heroContent}>
          <Text style={styles.cardEyebrow}>Soil moisture</Text>
          <MoistureGauge level={status?.moistureLevel} loading={loading && !status} />
          <Text style={[styles.bandLabel, { color: moistureBand.secondary }]}>{moistureBand.label}</Text>
        </GlassCard>

        <View style={styles.row}>
          <GlassCard style={styles.halfCard} contentStyle={styles.statContent}>
            <Text style={styles.cardEyebrow}>ADC raw</Text>
            {loading && status?.sensorRaw == null ? (
              <ActivityIndicator color={AppTheme.accent.teal} />
            ) : (
              <Text style={styles.statValue}>{status?.sensorRaw != null ? status.sensorRaw : "—"}</Text>
            )}
            <Text style={styles.statCaption}>0–4095 · higher = drier</Text>
          </GlassCard>

          <GlassCard style={styles.halfCard} contentStyle={styles.statContent}>
            <Text style={styles.cardEyebrow}>Dry threshold</Text>
            <Text style={styles.statValue}>
              {status?.dryThresholdRaw != null ? status.dryThresholdRaw : "—"}
            </Text>
            <Text style={styles.statCaption}>ESP_DRY_THRESHOLD_RAW</Text>
          </GlassCard>
        </View>

        <GlassCard>
          <View style={styles.pumpHeader}>
            <View>
              <Text style={styles.cardEyebrow}>Pump control</Text>
              <View style={styles.pumpStatusRow}>
                <View
                  style={[
                    styles.pumpDot,
                    { backgroundColor: pumpOn ? AppTheme.status.pumpOn : AppTheme.status.pumpOff },
                  ]}
                />
                <Text style={styles.pumpStatus}>{pumpOn ? "Running" : "Stopped"}</Text>
              </View>
            </View>
            <View style={[styles.pumpPill, pumpOn ? styles.pumpPillOn : styles.pumpPillOff]}>
              <Text style={styles.pumpPillText}>{pumpOn ? "ON" : "OFF"}</Text>
            </View>
          </View>
          <Text style={styles.cardBody}>
            Commands go to the server; your ESP32 syncs via GET /api/status and drives GPIO26.
          </Text>
          <PrimaryButton
            label={toggling ? "Updating…" : pumpOn ? "Turn pump OFF" : "Turn pump ON"}
            variant={pumpOn ? "danger" : "primary"}
            onPress={togglePump}
            disabled={toggling || !status}
          />
        </GlassCard>

        <GlassCard contentStyle={styles.syncContent}>
          <Text style={styles.cardEyebrow}>Last sensor sync</Text>
          <Text style={styles.syncTime}>
            {status?.lastSensorUpdate
              ? new Date(status.lastSensorUpdate).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "—"}
          </Text>
        </GlassCard>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    gap: 16,
  },
  heroContent: {
    paddingVertical: 12,
    gap: 4,
  },
  cardEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: AppTheme.text.muted,
  },
  bandLabel: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    marginTop: -4,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  halfCard: {
    flex: 1,
  },
  statContent: {
    padding: 14,
    minHeight: 110,
    justifyContent: "space-between",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
    color: AppTheme.text.primary,
    fontVariant: ["tabular-nums"],
  },
  statCaption: {
    fontSize: 11,
    color: AppTheme.text.muted,
    lineHeight: 15,
  },
  pumpHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  pumpStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  pumpDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pumpStatus: {
    fontSize: 22,
    fontWeight: "700",
    color: AppTheme.text.primary,
  },
  pumpPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: AppTheme.radius.pill,
    borderWidth: 1,
  },
  pumpPillOn: {
    backgroundColor: "rgba(34, 197, 94, 0.25)",
    borderColor: "#22c55e",
  },
  pumpPillOff: {
    backgroundColor: "rgba(100, 116, 139, 0.25)",
    borderColor: "#64748b",
  },
  pumpPillText: {
    fontSize: 13,
    fontWeight: "800",
    color: AppTheme.text.primary,
    letterSpacing: 1,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
    color: AppTheme.text.secondary,
  },
  syncContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  syncTime: {
    fontSize: 14,
    fontWeight: "600",
    color: AppTheme.text.primary,
  },
  errorBanner: {
    backgroundColor: AppTheme.status.errorBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  errorText: {
    color: AppTheme.status.error,
    fontSize: 14,
    fontWeight: "600",
  },
});
