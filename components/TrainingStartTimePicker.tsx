import DateTimePicker from "@react-native-community/datetimepicker";
import { createElement, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS, RADIUS } from "../constants/theme";

type Props = { value: string; onChange: (time: string) => void };
export default function TrainingStartTimePicker({ value, onChange }: Props) {
    const [visible, setVisible] = useState(false);
    const [hour, minute] = value.split(":").map(Number);
    const selected = new Date();
    selected.setHours(Number.isInteger(hour) ? hour : 18, Number.isInteger(minute) ? minute : 0, 0, 0);
    if (Platform.OS === "web") {
        return <View style={styles.webBox}>
            {createElement("input" as any, {
                type: "time", value,
                onChange: (event: any) => onChange(event.target.value),
                "aria-label": "Begintijd van training",
                style: { width: "100%", minHeight: 48, backgroundColor: "transparent",
                    border: "none", outline: "none", color: COLORS.text, fontSize: 16,
                    colorScheme: "dark", padding: "0 14px", boxSizing: "border-box" }
            })}
        </View>;
    }
    return <View>
        <Pressable style={styles.button} onPress={() => setVisible(true)}>
            <Text style={styles.text}>{value || "Kies een begintijd"}</Text>
        </Pressable>
        {visible && <DateTimePicker value={selected} mode="time" is24Hour
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_event, date) => {
                if (Platform.OS !== "ios") setVisible(false);
                if(date)onChange(`${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`);
            }}/>}
        {visible && Platform.OS === "ios" && <Pressable onPress={() => setVisible(false)}>
            <Text style={styles.done}>Gereed</Text>
        </Pressable>}
    </View>;
}
const styles=StyleSheet.create({
    webBox:{backgroundColor:COLORS.surfaceLight,borderRadius:RADIUS.md,borderColor:COLORS.border,borderWidth:1,marginBottom:14},
    button:{backgroundColor:COLORS.surfaceLight,borderRadius:RADIUS.md,borderColor:COLORS.border,borderWidth:1,padding:14,marginBottom:14},
    text:{color:COLORS.text,fontSize:16},
    done:{color:COLORS.primaryLight,textAlign:"right",fontWeight:"800",marginBottom:12}
});
