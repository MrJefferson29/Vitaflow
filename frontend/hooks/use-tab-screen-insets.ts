import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Top safe area + bottom tab bar height for scrollable tab screens. */
export function useTabScreenInsets() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  return {
    top: insets.top,
    bottom: tabBarHeight,
    tabBarHeight,
    contentPaddingTop: insets.top + 8,
    contentPaddingBottom: tabBarHeight + 16,
  };
}
