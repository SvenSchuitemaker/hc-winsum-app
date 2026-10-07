import { ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

type Props = {
    title: string;
    image: string;
    onPress: () => void;
};

export default function ExerciseCard({ title, image, onPress }: Props) {
    return (
        <Pressable style={styles.card} onPress={onPress}>
            <ImageBackground
                source={{ uri: image }}
                style={styles.image}
                imageStyle={styles.imageInner}
            >
                <View style={styles.overlay} />
                <View style={styles.bottom}>
                    <Text style={styles.title} numberOfLines={2}>
                        {title}
                    </Text>
                    <Text style={styles.linkText}>Bekijk oefening</Text>
                </View>
            </ImageBackground>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        width: "48%",
        marginBottom: SPACING.md,
        borderRadius: RADIUS.lg,
        overflow: "hidden",
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    image: {
        height: 170,
        justifyContent: "flex-end",
    },
    imageInner: {
        borderRadius: RADIUS.lg,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: COLORS.overlay,
    },
    bottom: {
        backgroundColor: COLORS.cardOverlay,
        paddingHorizontal: SPACING.sm,
        paddingVertical: SPACING.sm,
    },
    title: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "800",
        marginBottom: 4,
    },
    linkText: {
        color: COLORS.accent,
        fontSize: 12,
        fontWeight: "700",
    },
});