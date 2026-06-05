import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const PROMPTS = [
  "When should I irrigate tomatoes?",
  "Signs of over-watering?",
  "Best time to fertilize maize?",
  "How to read soil moisture %?",
];

type ChatPromptsProps = {
  onSelect: (text: string) => void;
  disabled?: boolean;
};

export function ChatPrompts({ onSelect, disabled }: ChatPromptsProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Suggested</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {PROMPTS.map((prompt) => (
          <Pressable
            key={prompt}
            style={[styles.chip, disabled && styles.chipDisabled]}
            onPress={() => onSelect(prompt)}
            disabled={disabled}>
            <Text style={styles.chipText}>{prompt}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8696a0",
    marginLeft: 4,
  },
  row: {
    gap: 8,
    paddingRight: 12,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#1f2c34",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    maxWidth: 260,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    color: "#e9edef",
    fontSize: 14,
  },
});
