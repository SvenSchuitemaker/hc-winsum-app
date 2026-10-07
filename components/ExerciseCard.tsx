import {
    ImageBackground,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

type Props = {
    title: string;
    image: string;
    onPress: () => void;
};

export default function ExerciseCard({ title, image, onPress }: Props) {
    const { width } = useWindowDimensions();
    const isCompact = width <= 390;

    return (
        <Pressable style={styles.card} onPress={onPress}>
            <ImageBackground
                source={{ uri: image }}
                style={[styles.image, isCompact && styles.imageCompact]}
                imageStyle={styles.imageInner}
            >
                <View style={styles.overlay} />
                <View style={[styles.bottom, isCompact && styles.bottomCompact]}>
                    <Text
                        style={[styles.title, isCompact && styles.titleCompact]}
                        numberOfLines={2}
                    >
                        {title}
                    </Text>
                    <Text style={[styles.linkText, isCompact && styles.linkTextCompact]}>
                        Bekijk oefening
                    </Text>
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
        minWidth: 0,
    },
    image: {
        height: 170,
        justifyContent: "flex-end",
    },
    imageCompact: {
        height: 150,
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
    bottomCompact: {
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    title: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "800",
        marginBottom: 4,
    },
    titleCompact: {
        fontSize: 14,
        lineHeight: 18,
    },
    linkText: {
        color: COLORS.accent,
        fontSize: 12,
        fontWeight: "700",
    },
    linkTextCompact: {
        fontSize: 11,
    },
});
