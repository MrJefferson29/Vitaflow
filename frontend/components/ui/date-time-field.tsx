import { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { AppTheme } from "@/constants/theme";
import { formatDueDateInput } from "@/lib/datetime";

type DateTimeFieldProps = {
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
};

type AndroidStep = "idle" | "date" | "time";

export function DateTimeField({ value, onChange, minimumDate }: DateTimeFieldProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState(value);
  const [androidStep, setAndroidStep] = useState<AndroidStep>("idle");
  const [androidDraft, setAndroidDraft] = useState(value);

  const openPicker = () => {
    if (Platform.OS === "ios") {
      setIosDraft(value);
      setIosOpen(true);
      return;
    }
    setAndroidDraft(value);
    setAndroidStep("date");
  };

  const onAndroidChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type === "dismissed") {
      setAndroidStep("idle");
      return;
    }
    if (!selected) {
      return;
    }

    if (androidStep === "date") {
      const next = new Date(androidDraft);
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setAndroidDraft(next);
      setAndroidStep("time");
      return;
    }

    if (androidStep === "time") {
      const next = new Date(androidDraft);
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      onChange(next);
      setAndroidStep("idle");
    }
  };

  const onIosChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (selected) {
      setIosDraft(selected);
    }
  };

  return (
    <>
      <Pressable style={styles.button} onPress={openPicker}>
        <Text style={styles.value}>{formatDueDateInput(value)}</Text>
        <Text style={styles.hint}>Tap to change</Text>
      </Pressable>

      {Platform.OS === "android" && androidStep !== "idle" ? (
        <DateTimePicker
          value={androidDraft}
          mode={androidStep === "date" ? "date" : "time"}
          display="default"
          onChange={onAndroidChange}
          minimumDate={androidStep === "date" ? minimumDate : undefined}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIosOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setIosOpen(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.modalTitle}>Due date & time</Text>
              <Pressable
                onPress={() => {
                  onChange(iosDraft);
                  setIosOpen(false);
                }}>
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={iosDraft}
              mode="datetime"
              display="spinner"
              onChange={onIosChange}
              minimumDate={minimumDate}
              themeVariant="dark"
              style={styles.iosPicker}
            />
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderColor: AppTheme.glass.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(20, 184, 166, 0.12)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  value: {
    fontSize: 16,
    fontWeight: "700",
    color: AppTheme.text.primary,
    fontVariant: ["tabular-nums"],
  },
  hint: {
    fontSize: 12,
    color: AppTheme.text.muted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: AppTheme.glass.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: AppTheme.text.primary,
  },
  modalCancel: {
    fontSize: 16,
    color: AppTheme.text.muted,
  },
  modalDone: {
    fontSize: 16,
    fontWeight: "700",
    color: AppTheme.accent.teal,
  },
  iosPicker: {
    height: 220,
  },
});
