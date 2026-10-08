import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    ImageBackground,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

type SharedExercise = {
    id: number;
    title: string;
    image_url: string | null;
    subtitle: string | null;
    difficulty: string | null;
    audience: string[] | null;
};

type SharedBlock = {
    id: number;
    position: number;
    title: string;
    duration: number;
    notes: string | null;
    exercise: SharedExercise | null;
};

type SharedTraining = {
    id: number;
    title: string;
    training_date: string | null;
    team: {
        id: number;
        name: string;
    } | null;
    blocks: SharedBlock[];
};

function formatDate(dateString: string | null) {
    if (!dateString) return "Geen datum";
    const [year, month, day] = dateString.split("-");
    if (!year || !month || !day) return dateString;
    return `${day}-${month}-${year}`;
}

export default function SharedTrainingScreen() {
    const { token } = useLocalSearchParams<{ token: string }>();
    const [training, setTraining] = useState<SharedTraining | null>(null);
    const [loading, setLoading] = useState(true);
    const [errorText, setErrorText] = useState("");

    useEffect(() => {
        if (token) {
            void loadSharedTraining();
        }
    }, [token]);

    async function loadSharedTraining() {
        try {
            setLoading(true);
            setErrorText("");

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const { data, error } = await supabase.rpc("get_shared_training", {
                p_share_token: token,
            });

            if (error) throw error;
            if (!data) throw new Error("Deze gedeelde training bestaat niet meer.");

            setTraining(data as SharedTraining);
        } catch (error) {
            setErrorText(
                error instanceof Error ? error.message : "Gedeelde training laden mislukt."
            );
        } finally {
            setLoading(false);
        }
    }

    const totalDuration = useMemo(
        () => training?.blocks?.reduce((sum, block) => sum + (block.duration || 0), 0) || 0,
        [training]
    );

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Training laden...</Text>
            </View>
        );
    }

    if (errorText || !training) {
        return (
            <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={44} color={COLORS.mutedText} />
                <Text style={styles.errorTitle}>Training niet beschikbaar</Text>
                <Text style={styles.errorText}>{errorText || "De training kon niet worden geladen."}</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.page}>
                <View style={styles.hero}>
                    <Text style={styles.eyebrow}>GEDEELDE TRAINING</Text>
                    <Text style={styles.title}>{training.title}</Text>

                    <View style={styles.metaRow}>
                        <View style={styles.metaChip}>
                            <Ionicons name="people-outline" size={16} color={COLORS.primaryLight} />
                            <Text style={styles.metaText}>{training.team?.name || "Geen team"}</Text>
                        </View>

                        <View style={styles.metaChip}>
                            <Ionicons name="calendar-outline" size={16} color={COLORS.primaryLight} />
                            <Text style={styles.metaText}>{formatDate(training.training_date)}</Text>
                        </View>

                        <View style={styles.metaChip}>
                            <Ionicons name="time-outline" size={16} color={COLORS.primaryLight} />
                            <Text style={styles.metaText}>{totalDuration} min</Text>
                        </View>
                    </View>

                    <Text style={styles.heroText}>
                        Bekijk hieronder alle onderdelen en oefeningafbeeldingen van deze training.
                    </Text>
                </View>

                {training.blocks.map((block, index) => (
                    <View key={block.id || block.position} style={styles.blockCard}>
                        <View style={styles.blockHeader}>
                            <View style={styles.numberBadge}>
                                <Text style={styles.numberBadgeText}>{index + 1}</Text>
                            </View>

                            <View style={styles.blockHeaderText}>
                                <Text style={styles.blockTitle}>{block.title}</Text>
                                <Text style={styles.blockDuration}>{block.duration} minuten</Text>
                            </View>
                        </View>

                        {block.exercise ? (
                            <>
                                {block.exercise.image_url ? (
                                    <ImageBackground
                                        source={{ uri: block.exercise.image_url }}
                                        style={styles.exerciseImage}
                                        imageStyle={styles.exerciseImageInner}
                                    >
                                        <View style={styles.imageOverlay} />
                                        <View style={styles.imageTextWrap}>
                                            <Text style={styles.exerciseTitle}>{block.exercise.title}</Text>
                                            {!!block.exercise.subtitle && (
                                                <Text style={styles.exerciseSubtitle}>
                                                    {block.exercise.subtitle}
                                                </Text>
                                            )}
                                        </View>
                                    </ImageBackground>
                                ) : (
                                    <View style={styles.imagePlaceholder}>
                                        <Ionicons name="image-outline" size={34} color={COLORS.mutedText} />
                                        <Text style={styles.exerciseTitle}>{block.exercise.title}</Text>
                                    </View>
                                )}

                                <View style={styles.exerciseMetaRow}>
                                    {!!block.exercise.difficulty && (
                                        <View style={styles.smallChip}>
                                            <Text style={styles.smallChipText}>{block.exercise.difficulty}</Text>
                                        </View>
                                    )}

                                    {(block.exercise.audience || []).map((audience) => (
                                        <View key={audience} style={styles.smallChip}>
                                            <Text style={styles.smallChipText}>{audience}</Text>
                                        </View>
                                    ))}
                                </View>
                            </>
                        ) : (
                            <Text style={styles.noExerciseText}>Geen oefening gekoppeld.</Text>
                        )}

                        {!!block.notes && (
                            <View style={styles.notesBox}>
                                <Text style={styles.notesLabel}>Notities</Text>
                                <Text style={styles.notesText}>{block.notes}</Text>
                            </View>
                        )}
                    </View>
                ))}

                <View style={styles.footerCard}>
                    <Ionicons name="share-social-outline" size={22} color={COLORS.primaryLight} />
                    <Text style={styles.footerText}>
                        Deze training is gedeeld vanuit de H.C. Winsum trainersapp.
                    </Text>
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    content: {
        padding: SPACING.md,
        paddingBottom: SPACING.xxl,
    },
    page: {
        width: "100%",
        maxWidth: 900,
        alignSelf: "center",
    },
    center: {
        flex: 1,
        backgroundColor: COLORS.background,
        alignItems: "center",
        justifyContent: "center",
        padding: SPACING.lg,
    },
    loadingText: {
        color: COLORS.mutedText,
        marginTop: SPACING.md,
    },
    errorTitle: {
        color: COLORS.text,
        fontSize: 22,
        fontWeight: "900",
        marginTop: SPACING.md,
        marginBottom: 8,
    },
    errorText: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
        textAlign: "center",
    },
    hero: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: SPACING.lg,
        marginBottom: SPACING.lg,
    },
    eyebrow: {
        color: COLORS.primaryLight,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.2,
        marginBottom: 6,
    },
    title: {
        color: COLORS.text,
        fontSize: 30,
        fontWeight: "900",
        marginBottom: SPACING.md,
    },
    metaRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: SPACING.md,
    },
    metaChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    metaText: {
        color: COLORS.text,
        fontSize: 13,
        fontWeight: "700",
    },
    heroText: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
    },
    blockCard: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: SPACING.md,
        marginBottom: SPACING.md,
    },
    blockHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: SPACING.md,
    },
    numberBadge: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: COLORS.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    numberBadgeText: {
        color: COLORS.text,
        fontWeight: "900",
    },
    blockHeaderText: {
        flex: 1,
    },
    blockTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "900",
        marginBottom: 2,
    },
    blockDuration: {
        color: COLORS.primaryLight,
        fontSize: 13,
        fontWeight: "700",
    },
    exerciseImage: {
        width: "100%",
        aspectRatio: 16 / 9,
        justifyContent: "flex-end",
        overflow: "hidden",
    },
    exerciseImageInner: {
        borderRadius: RADIUS.lg,
    },
    imageOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.28)",
    },
    imageTextWrap: {
        padding: SPACING.md,
        backgroundColor: "rgba(7,17,31,0.78)",
        borderBottomLeftRadius: RADIUS.lg,
        borderBottomRightRadius: RADIUS.lg,
    },
    exerciseTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "900",
    },
    exerciseSubtitle: {
        color: COLORS.mutedText,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 4,
    },
    imagePlaceholder: {
        minHeight: 150,
        borderRadius: RADIUS.lg,
        backgroundColor: COLORS.surfaceLight,
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: SPACING.md,
    },
    exerciseMetaRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 7,
        marginTop: 10,
    },
    smallChip: {
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.pill,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    smallChipText: {
        color: COLORS.primaryLight,
        fontSize: 12,
        fontWeight: "800",
    },
    noExerciseText: {
        color: COLORS.mutedText,
        fontSize: 14,
    },
    notesBox: {
        marginTop: SPACING.md,
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.md,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    notesLabel: {
        color: COLORS.primaryLight,
        fontSize: 12,
        fontWeight: "800",
        marginBottom: 5,
    },
    notesText: {
        color: COLORS.text,
        fontSize: 14,
        lineHeight: 21,
    },
    footerCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: SPACING.md,
    },
    footerText: {
        flex: 1,
        color: COLORS.mutedText,
        fontSize: 13,
        lineHeight: 19,
    },
});
