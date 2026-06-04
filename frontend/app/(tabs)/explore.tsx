import { useCallback, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassCard } from "@/components/ui/glass-card";
import { PrimaryButton } from "@/components/ui/primary-button";
import { ScreenBackground } from "@/components/ui/screen-background";
import { SectionHeader } from "@/components/ui/section-header";
import { AppTheme } from "@/constants/theme";
import { api, Reminder } from "@/lib/api";

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadReminders = useCallback(async () => {
    try {
      setError(null);
      setReminders(await api.getReminders());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load reminders.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadReminders();
    }, [loadReminders]),
  );

  const addReminder = async () => {
    if (!title.trim() || !dueAt.trim()) {
      setError("Please provide both task title and due date/time.");
      return;
    }

    const parsedDate = new Date(dueAt);
    if (Number.isNaN(parsedDate.getTime())) {
      setError("Due date format is invalid. Example: 2026-05-30 06:00");
      return;
    }

    try {
      setError(null);
      const created = await api.createReminder(title.trim(), parsedDate.toISOString());
      setReminders((prev) => [created, ...prev]);
      setTitle("");
      setDueAt("");
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Unable to add reminder.");
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
          {
            paddingTop: insets.top + (Platform.OS === "ios" ? 8 : 16),
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <SectionHeader
          title="Farm tasks"
          subtitle="Schedule weeding, fertilizer, harvest, and other field work."
        />

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <GlassCard prominent>
          <Text style={styles.cardEyebrow}>New reminder</Text>
          <Text style={styles.label}>Task</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Apply nitrogen fertilizer"
            placeholderTextColor={AppTheme.text.muted}
          />
          <Text style={styles.label}>Due date & time</Text>
          <TextInput
            style={styles.input}
            value={dueAt}
            onChangeText={setDueAt}
            placeholder="YYYY-MM-DD HH:mm"
            placeholderTextColor={AppTheme.text.muted}
          />
          <PrimaryButton label="Add reminder" onPress={addReminder} />
        </GlassCard>

        {reminders.length === 0 ? (
          <GlassCard>
            <Text style={styles.emptyTitle}>No tasks yet</Text>
            <Text style={styles.emptyBody}>Add your first farm reminder above.</Text>
          </GlassCard>
        ) : (
          reminders.map((item) => (
            <GlassCard key={item.id}>
              <View style={styles.taskRow}>
                <View style={[styles.taskAccent, item.done && styles.taskAccentDone]} />
                <View style={styles.taskBody}>
                  <Text style={[styles.taskText, item.done && styles.taskDone]}>{item.title}</Text>
                  <Text style={styles.timeText}>
                    Due {new Date(item.dueAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </Text>
                </View>
              </View>
              <View style={styles.row}>
                <Pressable
                  style={[styles.chip, styles.chipPrimary]}
                  onPress={() => toggleReminder(item.id, item.done)}>
                  <Text style={styles.chipText}>{item.done ? "Undo" : "Done"}</Text>
                </Pressable>
                <Pressable style={[styles.chip, styles.chipDanger]} onPress={() => removeReminder(item.id)}>
                  <Text style={styles.chipText}>Delete</Text>
                </Pressable>
              </View>
            </GlassCard>
          ))
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
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
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
    backgroundColor: AppTheme.accent.teal,
    alignSelf: "stretch",
  },
  taskAccentDone: {
    backgroundColor: AppTheme.text.muted,
  },
  taskBody: {
    flex: 1,
    gap: 4,
  },
  taskText: {
    fontSize: 17,
    fontWeight: "700",
    color: AppTheme.text.primary,
  },
  taskDone: {
    textDecorationLine: "line-through",
    color: AppTheme.text.muted,
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
