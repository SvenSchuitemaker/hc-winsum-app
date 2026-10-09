import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../constants/theme";
import type { BoardItem, HatColor } from "./boardTypes";
import { HAT_COLOR_OPTIONS } from "./toolDefinitions";

function getHatVisualColors(color: HatColor | undefined) {
    const option = HAT_COLOR_OPTIONS.find((item) => item.value === color) ?? HAT_COLOR_OPTIONS[2];
    return {
        fill: option.fill,
        border: option.border,
    };
}

type Props = {
    item: BoardItem;
    boardWidth: number;
    boardHeight: number;
    selected: boolean;
    isSelectMode: boolean;
    onSelect: () => void;
    label?: string;
};

export default function BoardItemOverlay({
    item,
    boardWidth,
    boardHeight,
    selected,
    isSelectMode,
    onSelect,
    label,
}: Props) {
    const isText = item.type === "text";
    const itemSize = isText ? 72 : 22;
    const halfItemSize = itemSize / 2;
    const left = item.x * boardWidth;
    const top = item.y * boardHeight;
    const hatColors = getHatVisualColors(item.color);

    return (
        <View
            style={[
                styles.item,
                {
                    left: left - halfItemSize,
                    top: top - halfItemSize,
                    borderColor: selected ? COLORS.primary : "transparent",
                    width: itemSize,
                    height: isText ? 30 : 22,
                },
            ]}
            pointerEvents={isSelectMode ? "auto" : "none"}
        >
            <Pressable onPress={onSelect} hitSlop={12} style={[styles.itemInner, isText && { width: 72, height: 30 }]}> 
                {item.type === "text" && <Text numberOfLines={2} style={{ color: "#FFFFFF", fontSize: 10, textAlign: "center", fontWeight: "700" }}>{item.text}</Text>}
                {item.type === "player" && (
                    <View style={[styles.playerWrap, { backgroundColor: ({ black: "#171717", orange: "#F39A25", blue: "#199ED8", grey: "#A5A5A5", white: "#F5F5F5", red: "#D93945", green: "#2EAD72" } as Record<string,string>)[item.shirtColor ?? "blue"] }] }>
                        <Text style={[styles.playerText, item.shirtColor === "white" && { color: "#111111" }]}>{item.label ?? ""}</Text>
                    </View>
                )}
                {item.type === "cone" && <View style={styles.cone} />}

                {item.type === "hat" && (
                    <View
                        style={[
                            styles.hat,
                            {
                                backgroundColor: hatColors.fill,
                                borderColor: hatColors.border,
                            },
                        ]}
                    />
                )}

                {item.type === "attacker" && (
                    <View style={styles.playerWrap}>
                        <Text style={styles.playerText}>{label ?? "A1"}</Text>
                    </View>
                )}

                {item.type === "defender" && (
                    <View style={[styles.playerWrap, styles.defenderWrap]}>
                        <Text style={styles.playerText}>{label ?? "D1"}</Text>
                    </View>
                )}

                {item.type === "trainer" && (
                    <View style={[styles.playerWrap, styles.trainerWrap]}>
                        <Text style={[styles.playerText, styles.trainerText]}>{label ?? "T"}</Text>
                    </View>
                )}

                {item.type === "ball" && <View style={styles.ball} />}

                {item.type === "goal" && (
                    <View
                        style={[
                            styles.goalU,
                            {
                                transform: [{ rotate: `${item.rotation ?? 0}deg` }],
                            },
                        ]}
                    />
                )}
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    item: {
        position: "absolute",
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 5,
    },
    itemInner: {
        width: 22,
        height: 22,
        alignItems: "center",
        justifyContent: "center",
    },
    cone: {
        width: 0,
        height: 0,
        borderLeftWidth: 6,
        borderRightWidth: 6,
        borderBottomWidth: 11,
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
        borderBottomColor: "#FF8A3D",
    },
    hat: {
        width: 12,
        height: 12,
        borderRadius: 99,
        borderWidth: 2,
    },
    ball: {
        width: 9,
        height: 9,
        borderRadius: 99,
        backgroundColor: "#FFFFFF",
        borderWidth: 1.5,
        borderColor: "#111111",
    },
    playerWrap: {
        width: 18,
        height: 18,
        borderRadius: 99,
        backgroundColor: COLORS.primary,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.2)",
    },
    trainerWrap: {
        backgroundColor: "#FFFFFF",
        borderColor: "#1B3555",
    },
    trainerText: {
        color: "#1B3555",
    },
    playerText: {
        color: COLORS.text,
        fontWeight: "900",
        fontSize: 6.5,
    },
    defenderWrap: {
        backgroundColor: "#FF5A5F",
    },
    goalU: {
        width: 20,
        height: 14,
        borderLeftWidth: 2,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderColor: "#FFFFFF",
        backgroundColor: "transparent",
    },
});