import { useCallback, useEffect, useRef, useState } from "react";
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
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatBubble, TypingIndicator } from "@/components/chat/chat-bubble";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatPrompts } from "@/components/chat/chat-prompts";
import { api, HealthStatus } from "@/lib/api";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: Date;
};

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInput>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hello! Ask me about irrigation, soil moisture, pests, or fertilizer for your farm.",
      createdAt: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    api
      .getHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) {
        return;
      }

      const userMessage: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        text: trimmed,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setSending(true);

      try {
        const { reply } = await api.chat(trimmed);
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: reply,
            createdAt: new Date(),
          },
        ]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not get a reply.";
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            text: message,
            createdAt: new Date(),
          },
        ]);
      } finally {
        setSending(false);
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      }
    },
    [sending],
  );

  const showPrompts = messages.length <= 1 && !sending;
  const aiLive = Boolean(health?.aiConfigured ?? health?.openAiConfigured);
  const connected = Boolean(health?.ok);

  return (
    <View style={styles.screen}>
      <View style={{ paddingTop: insets.top, backgroundColor: "#0f1f2e" }}>
        <ChatHeader
          title="Agronomy Assistant"
          subtitle={connected ? "online" : "connecting…"}
          statusLabel={aiLive ? "Gemini" : "Basic"}
          statusColor={aiLive ? "#25d366" : "#fbbf24"}
          onBack={() => router.back()}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 0}>
        <FlatList
          ref={listRef}
          style={styles.flex}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatBubble role={item.role} text={item.text} timestamp={item.createdAt} />
          )}
          contentContainerStyle={[
            styles.listContent,
            showPrompts ? styles.listWithPrompts : null,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListFooterComponent={
            <>
              {showPrompts ? (
                <ChatPrompts onSelect={(prompt) => sendMessage(prompt)} disabled={sending} />
              ) : null}
              {sending ? <TypingIndicator /> : null}
            </>
          }
        />

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Message"
              placeholderTextColor="#8696a0"
              multiline
              maxLength={2000}
              editable={!sending}
              blurOnSubmit={false}
              onFocus={() => {
                setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
              }}
            />
          </View>
          <Pressable
            style={[styles.sendFab, (!input.trim() || sending) && styles.sendFabDisabled]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || sending}>
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <MaterialIcons name="send" size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0b141a",
  },
  flex: {
    flex: 1,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 8,
    flexGrow: 1,
  },
  listWithPrompts: {
    paddingBottom: 4,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
    backgroundColor: "#0f1f2e",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  inputWrap: {
    flex: 1,
    backgroundColor: "#1f2c34",
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    minHeight: 48,
    maxHeight: 120,
    justifyContent: "center",
  },
  input: {
    fontSize: 17,
    lineHeight: 22,
    color: "#e9edef",
    padding: 0,
    margin: 0,
  },
  sendFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#00a884",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },
  sendFabDisabled: {
    opacity: 0.45,
  },
});
