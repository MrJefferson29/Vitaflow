import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenBackground } from "@/components/ui/screen-background";
import { SectionHeader } from "@/components/ui/section-header";
import { AppTheme } from "@/constants/theme";
import { api } from "@/lib/api";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Ask about irrigation timing, soil moisture, pests, or fertilizer. Add OPENAI_API_KEY on the server for richer answers.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setSending(true);

    try {
      const { reply } = await api.chat(trimmed);
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", text: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get a reply.");
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  return (
    <ScreenBackground>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}>
        <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "ios" ? 8 : 16) }]}>
          <SectionHeader title="Agronomy AI" subtitle="Crop care guidance from your backend." />
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === "user" ? styles.bubbleUser : styles.bubbleAssistant,
              ]}>
              <Text
                style={[
                  styles.bubbleText,
                  item.role === "user" ? styles.bubbleTextUser : styles.bubbleTextAssistant,
                ]}>
                {item.text}
              </Text>
            </View>
          )}
        />

        {Platform.OS === "ios" ? (
          <BlurView intensity={70} tint="dark" style={styles.composer}>
            <View style={[styles.composerInner, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Ask a farming question…"
                placeholderTextColor={AppTheme.text.muted}
                multiline
                maxLength={2000}
                editable={!sending}
                onSubmitEditing={send}
                blurOnSubmit={false}
              />
              <Pressable
                style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
                onPress={send}
                disabled={!input.trim() || sending}>
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.sendLabel}>Send</Text>
                )}
              </Pressable>
            </View>
          </BlurView>
        ) : (
          <View style={[styles.composer, styles.composerAndroid]}>
            <View style={[styles.composerInner, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Ask a farming question…"
                placeholderTextColor={AppTheme.text.muted}
                multiline
                maxLength={2000}
                editable={!sending}
                onSubmitEditing={send}
                blurOnSubmit={false}
              />
              <Pressable
                style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
                onPress={send}
                disabled={!input.trim() || sending}>
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.sendLabel}>Send</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  errorBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
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
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: AppTheme.accent.teal,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderWidth: 1,
    borderColor: AppTheme.glass.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 23,
  },
  bubbleTextUser: {
    color: "#fff",
  },
  bubbleTextAssistant: {
    color: AppTheme.text.primary,
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: AppTheme.glass.border,
    overflow: "hidden",
  },
  composerAndroid: {
    backgroundColor: "rgba(12, 25, 41, 0.95)",
    borderTopWidth: 1,
    borderTopColor: AppTheme.glass.border,
  },
  composerInner: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: AppTheme.glass.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 16,
    color: AppTheme.text.primary,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  sendButton: {
    minWidth: 72,
    height: 44,
    borderRadius: 14,
    backgroundColor: AppTheme.accent.tealDark,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendLabel: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
