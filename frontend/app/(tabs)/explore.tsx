import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";

import { DateTimeField } from "@/components/ui/date-time-field";
import { GlassCard } from "@/components/ui/glass-card";
import { PrimaryButton } from "@/components/ui/primary-button";
import { ScreenBackground } from "@/components/ui/screen-background";
import { SectionHeader } from "@/components/ui/section-header";
import { AppTheme } from "@/constants/theme";
import { useTabScreenInsets } from "@/hooks/use-tab-screen-insets";
import {
  defaultReminderDate,
  formatDisplayDate,
  formatDueDateInput,
  parseDueDate,
  reminderStatus,
} from "@/lib/datetime";
import { api, HealthStatus, Reminder } from "@/lib/api";

const STATUS_COLORS = {
  overdue: "#f87171",
  today: "#fbbf24",
  upcoming: AppTheme.accent.teal,
  done: AppTheme.text.muted,
};

export default function RemindersScreen() {
  const { contentPaddingTop, contentPaddingBottom } = useTabScreenInsets();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(defaultReminderDate);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const loadReminders = useCallback(async () => {
    try {
      setError(null);
      const [items, healthStatus] = await Promise.all([api.getReminders(), api.getHealth()]);
      setReminders(items);
      setHealth(healthStatus);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load reminders.");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadReminders();
    }, [loadReminders]),
  );

  const addReminder = async () => {
    if (!title.trim()) {
      setError("Please enter a task title.");
      return;
    }

    const parsed = parseDueDate(formatDueDateInput(dueDate));
    if (!parsed) {
      setError("Please choose a valid due date and time.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const created = await api.createReminder(title.trim(), parsed.toISOString());
      setReminders((prev) =>
        [...prev, created].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()),
      );
      setTitle("");
      setDueDate(defaultReminderDate());
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Unable to add reminder.");
    } finally {
      setSaving(false);
    }
  };

  const toggleReminder = async (id: string, done: boolean) => {
    try {
      const updated = await api.updateReminder(id, !done);
      setReminders((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update reminder.");
    }
  };

  const removeReminder = async (id: string) => {
    try {
      await api.deleteReminder(id);
      setReminders((prev) => prev.filter((item) => item.id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete reminder.");
    }
  };

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: contentPaddingTop, paddingBottom: contentPaddingBottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <SectionHeader
          title="Farm alerts"
          subtitle="Schedule irrigation, fertilizer, and harvest reminders."
        />

        <GlassCard contentStyle={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: health?.ok ? "#22c55e" : "#ef4444" }]} />
            <Text style={styles.statusText}>
              {health?.ok
                ? `Connected · ${health.storage === "mongodb" ? "MongoDB" : "Local JSON storage"}`
                : "Server offline — check EXPO_PUBLIC_API_URL"}
            </Text>
          </View>
          <Text style={styles.statusUrl}>{api.baseUrl}</Text>
        </GlassCard>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <GlassCard prominent>
          <Text style={styles.cardEyebrow}>New alert</Text>
          <Text style={styles.label}>Task</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Irrigate north field"
            placeholderTextColor={AppTheme.text.muted}
          />
          <Text style={styles.label}>Due date & time</Text>
          <DateTimeField value={dueDate} onChange={setDueDate} minimumDate={new Date()} />
          <PrimaryButton label={saving ? "Saving…" : "Save alert"} onPress={addReminder} disabled={saving} />
        </GlassCard>

        {loading ? (
          <GlassCard contentStyle={styles.loadingCard}>
            <ActivityIndicator color={AppTheme.accent.teal} />
            <Text style={styles.loadingText}>Loading alerts…</Text>
          </GlassCard>
        ) : reminders.length === 0 ? (
          <GlassCard>
            <Text style={styles.emptyTitle}>No alerts yet</Text>
            <Text style={styles.emptyBody}>Saved reminders appear here and persist on the server.</Text>
          </GlassCard>
        ) : (
          reminders.map((item) => {
            const status = reminderStatus(item.dueAt, item.done);
            return (
              <GlassCard key={item.id}>
                <View style={styles.taskRow}>
                  <View style={[styles.taskAccent, { backgroundColor: STATUS_COLORS[status] }]} />
                  <View style={styles.taskBody}>
                    <View style={styles.taskTitleRow}>
                      <Text style={[styles.taskText, item.done && styles.taskDone]}>{item.title}</Text>
                      <View style={[styles.statusPill, { borderColor: STATUS_COLORS[status] }]}>
                        <Text style={[styles.statusPillText, { color: STATUS_COLORS[status] }]}>
                          {status === "done"
                            ? "Done"
                            : status === "overdue"
                              ? "Overdue"
                              : status === "today"
                                ? "Today"
                                : "Upcoming"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.timeText}>Due {formatDisplayDate(item.dueAt)}</Text>
                  </View>
                </View>
                <View style={styles.row}>
                  <Pressable
                    style={[styles.chip, styles.chipPrimary]}
                    onPress={() => toggleReminder(item.id, item.done)}>
                    <Text style={styles.chipText}>{item.done ? "Undo" : "Mark done"}</Text>
                  </Pressable>
                  <Pressable style={[styles.chip, styles.chipDanger]} onPress={() => removeReminder(item.id)}>
                    <Text style={styles.chipText}>Delete</Text>
                  </Pressable>
                </View>
              </GlassCard>
            );
          })
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    gap: 14,
  },
  statusCard: {
    gap: 6,
    paddingVertical: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: AppTheme.text.primary,
  },
  statusUrl: {
    fontSize: 11,
    color: AppTheme.text.muted,
  },
  cardEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: AppTheme.text.muted,
    marginBottom: 4,
  },
  label: {
    fontWeight: "600",
    fontSize: 14,
    color: AppTheme.text.secondary,
  },
  input: {
    borderWidth: 1,
    borderColor: AppTheme.glass.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: AppTheme.text.primary,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  taskRow: {
    flexDirection: "row",
    gap: 12,
  },
  taskAccent: {
    width: 4,
    borderRadius: 2,
    alignSelf: "stretch",
  },
  taskBody: {
    flex: 1,
    gap: 6,
  },
  taskTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  taskText: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: AppTheme.text.primary,
  },
  taskDone: {
    textDecorationLine: "line-through",
    color: AppTheme.text.muted,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timeText: {
    fontSize: 13,
    color: AppTheme.text.secondary,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  chip: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
  },
  chipPrimary: {
    backgroundColor: "rgba(20, 184, 166, 0.25)",
    borderColor: AppTheme.accent.teal,
  },
  chipDanger: {
    backgroundColor: "rgba(220, 38, 38, 0.2)",
    borderColor: "#f87171",
  },
  chipText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: AppTheme.text.primary,
  },
  emptyBody: {
    fontSize: 14,
    color: AppTheme.text.secondary,
  },
  loadingCard: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 24,
  },
  loadingText: {
    color: AppTheme.text.secondary,
    fontSize: 14,
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
