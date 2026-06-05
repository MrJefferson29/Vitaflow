import { StyleSheet, Text, View } from "react-native";

type ChatBubbleProps = {
  role: "user" | "assistant";
  text: string;
  timestamp?: Date;
};

export function ChatBubble({ role, text, timestamp }: ChatBubbleProps) {
  const isUser = role === "user";
  const timeLabel = timestamp
    ? timestamp.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.text, isUser ? styles.textUser : styles.textAssistant]}>{text}</Text>
        {timeLabel ? (
          <Text style={[styles.time, isUser ? styles.timeUser : styles.timeAssistant]}>{timeLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function TypingIndicator() {
  return (
    <View style={[styles.row, styles.rowAssistant]}>
      <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
        <Text style={styles.typingText}>typing…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  rowUser: {
    alignItems: "flex-end",
  },
  rowAssistant: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 12,
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 10,
  },
  bubbleUser: {
    backgroundColor: "#005c4b",
    borderTopRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: "#1f2c34",
    borderTopLeftRadius: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  textUser: {
    color: "#e9edef",
  },
  textAssistant: {
    color: "#e9edef",
  },
  time: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  timeUser: {
    color: "rgba(233, 237, 239, 0.65)",
  },
  timeAssistant: {
    color: "rgba(233, 237, 239, 0.55)",
  },
  typingBubble: {
    paddingVertical: 10,
  },
  typingText: {
    color: "rgba(233, 237, 239, 0.7)",
    fontSize: 15,
    fontStyle: "italic",
  },
});
