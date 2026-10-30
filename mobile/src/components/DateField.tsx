import { createElement } from "react";
import { Platform, TextInput, type StyleProp, type TextStyle } from "react-native";
import { colors } from "@/lib/theme";

const today = () => new Date().toISOString().slice(0, 10);

/** Date field: the browser's own date picker on web, a YYYY-MM-DD field on native. */
export default function DateField({ value, onChange, label, style }: { value: string; onChange: (v: string) => void; label: string; style?: StyleProp<TextStyle> }) {
  if (Platform.OS === "web") {
    return createElement("input", {
      type: "date", value, max: today(), "aria-label": label,
      onChange: (e: any) => onChange(e.target.value),
      style: { border: 0, background: "transparent", fontSize: 17, color: colors.text, fontFamily: "inherit", padding: 0 },
    });
  }
  return (
    <TextInput value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" placeholderTextColor="#6e7891" style={style}
      keyboardType="numbers-and-punctuation" maxLength={10} accessibilityLabel={label} />
  );
}
