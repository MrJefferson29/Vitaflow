import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";

import { GlassCard } from "@/components/ui/glass-card";
import { MoistureGauge } from "@/components/ui/moisture-gauge";
import { PrimaryButton } from "@/components/ui/primary-button";
import { ScreenBackground } from "@/components/ui/screen-background";
import { SectionHeader } from "@/components/ui/section-header";
import { AppTheme } from "@/constants/theme";
import { useTabScreenInsets } from "@/hooks/use-tab-screen-insets";
import { getMoistureBand } from "@/lib/moisture";
import {
  FRESHNESS_COLORS,
  formatSensorAge,
  sensorAgeSeconds,
  sensorFreshness,
} from "@/lib/sensor-time";
import { api, IrrigationStatus } from "@/lib/api";

const POLL_MS = 3000;

export default function DashboardScreen() {
  const { contentPaddingTop, contentPaddingBottom } = useTabScreenInsets();
  const [status, setStatus] = useState<IrrigationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setError(null);
      }
      const next = await api.getStatus();
      setStatus(next);
    } catch (loadError) {
      if (!silent) {
        setError(loadError instanceof Error ? loadError.message : "Unable to fetch system status.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadStatus();
      pollRef.current = setInterval(() => loadStatus(true), POLL_MS);
      const tickTimer = setInterval(() => setTick((n) => n + 1), 1000);

      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
        }
        clearInterval(tickTimer);
      };
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
        prev ? { ...prev, pumpOn: Boolean(result.pumpOn), pumpAutoTriggered: false } : prev,
      );
      await new Promise((r) => setTimeout(r, 600));
      await loadStatus(true);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update pump.");
    } finally {
      setToggling(false);
    }
  };

  const moistureBand = getMoistureBand(status?.moistureLevel);
  const pumpOn = Boolean(status?.pumpOn);
  const ageSec =
    status?.sensorAgeSeconds ?? sensorAgeSeconds(status?.lastSensorUpdate ?? null);
  const freshness = sensorFreshness(ageSec);
  void tick;

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: contentPaddingTop, paddingBottom: contentPaddingBottom },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => loadStatus()}
            tintColor={AppTheme.accent.teal}
          />
        }>
        <SectionHeader
          title="Irrigation"
          subtitle="Live readings refresh every few seconds while this screen is open."
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

        <GlassCard contentStyle={styles.syncContent}>
          <View style={styles.syncLeft}>
            <Text style={styles.cardEyebrow}>Last sensor sync</Text>
            <Text style={styles.syncTime}>
              {status?.lastSensorUpdate
                ? new Date(status.lastSensorUpdate).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "medium",
                  })
                : "Waiting for ESP32…"}
            </Text>
            <Text style={styles.syncAge}>{formatSensorAge(ageSec)}</Text>
          </View>
          <View style={[styles.freshnessPill, { borderColor: FRESHNESS_COLORS[freshness] }]}>
            <View style={[styles.freshnessDot, { backgroundColor: FRESHNESS_COLORS[freshness] }]} />
            <Text style={[styles.freshnessText, { color: FRESHNESS_COLORS[freshness] }]}>
              {freshness === "live"
                ? "Live"
                : freshness === "recent"
                  ? "Recent"
                  : freshness === "stale"
                    ? "Stale"
                    : "Offline"}
            </Text>
          </View>
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
            <Text style={styles.cardEyebrow}>Auto irrigate</Text>
            <Text style={styles.statValue}>
              {status?.autoIrrigateEnabled
                ? `< ${status.autoIrrigateMoistureMin ?? 30}%`
                : "Off"}
            </Text>
            <Text style={styles.statCaption}>
              {status?.autoIrrigateEnabled
                ? `Pump off above ${status.autoIrrigateMoistureMax ?? 55}%`
                : "Set AUTO_IRRIGATE_ENABLED on server"}
            </Text>
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
              {status?.pumpAutoTriggered ? (
                <Text style={styles.autoHint}>Auto-irrigation active (moisture below threshold)</Text>
              ) : null}
            </View>
            <View style={[styles.pumpPill, pumpOn ? styles.pumpPillOn : styles.pumpPillOff]}>
              <Text style={styles.pumpPillText}>{pumpOn ? "ON" : "OFF"}</Text>
            </View>
          </View>
          <Text style={styles.cardBody}>
            The server turns the pump on automatically when soil is too dry — no app required. Manual toggles
            apply until the next sensor reading.
          </Text>
          <PrimaryButton
            label={toggling ? "Updating…" : pumpOn ? "Turn pump OFF" : "Turn pump ON"}
            variant={pumpOn ? "danger" : "primary"}
            onPress={togglePump}
            disabled={toggling || !status}
          />
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
  syncContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  syncLeft: {
    flex: 1,
    gap: 4,
  },
  syncTime: {
    fontSize: 15,
    fontWeight: "600",
    color: AppTheme.text.primary,
  },
  syncAge: {
    fontSize: 13,
    color: AppTheme.text.secondary,
  },
  freshnessPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  freshnessDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  freshnessText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
    fontSize: 22,
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
  autoHint: {
    fontSize: 12,
    color: AppTheme.accent.teal,
    marginTop: 4,
    fontWeight: "600",
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
