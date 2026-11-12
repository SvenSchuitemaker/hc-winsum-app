import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
    ImageBackground, KeyboardAvoidingView, Modal, Platform, Pressable,
    ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export type ExerciseChoice<Id extends number | string = number | string> = {
    id: Id;
    title: string;
    category_slug: string;
    image_url: string | null;
    isConcept?: boolean;
};

export type ExerciseCategory = { slug: string; title: string };

type Props<T extends ExerciseChoice> = {
    subtitle: string;
    exercises: readonly T[];
    categories: readonly ExerciseCategory[];
    selectedId?: string;
    multiple?: { selected: readonly T[]; limit: number };
    onSelect: (exercise: T) => void;
    onClose: () => void;
    onCreate?: () => void;
};

export default function ExercisePicker<T extends ExerciseChoice>({
    subtitle, exercises, categories, selectedId, multiple, onSelect, onClose, onCreate,
}: Props<T>) {
    const [category, setCategory] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [onlySelected, setOnlySelected] = useState(false);
    const search = query.trim().toLowerCase();
    const selectedIds = new Set(multiple?.selected.map(exercise => exercise.id));
    const limitReached = !!multiple && selectedIds.size >= multiple.limit;
    const results = onlySelected && multiple
        ? multiple.selected
        : exercises.filter(exercise =>
            (category === null || exercise.category_slug === category)
            && exercise.title.toLowerCase().includes(search),
        );

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                <View style={styles.exerciseModal}>
                    <View style={styles.modalHeader}>
                        <View style={styles.modalHeaderText}>
                            <Text accessibilityRole="header" style={styles.modalTitle}>
                                {multiple ? "Kies oefeningen" : "Kies een oefening"}
                            </Text>
                            <Text style={styles.modalSubtitle} numberOfLines={2}>{subtitle}</Text>
                        </View>
                        {multiple ? (
                            <Pressable accessibilityRole="button" style={styles.doneButton} onPress={onClose}>
                                <Text style={styles.categoryTabText}>Gereed</Text>
                            </Pressable>
                        ) : (
                            <Pressable accessibilityRole="button" accessibilityLabel="Sluiten"
                                style={styles.modalCloseButton} onPress={onClose}>
                                <Ionicons name="close-outline" size={26} color={COLORS.text} />
                            </Pressable>
                        )}
                    </View>

                    <ScrollView horizontal style={styles.categoryTabsScroll} showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryTabs} keyboardShouldPersistTaps="handled">
                        {[{ slug: null, title: "Alle" }, ...categories].map(item => {
                            const selected = !onlySelected && category === item.slug;
                            return (
                                <Pressable key={item.slug ?? "all"} accessibilityRole="button" accessibilityState={{ selected }}
                                    style={[styles.categoryTab, selected && styles.categoryTabSelected]}
                                    onPress={() => { setCategory(item.slug); setOnlySelected(false); }}>
                                    <Text style={styles.categoryTabText} numberOfLines={1}>{item.title}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>

                    {multiple && (
                        <View style={styles.searchRow}>
                            {!onlySelected && (
                                <TextInput accessibilityLabel="Zoek een oefening" style={styles.searchInput}
                                    placeholder="Zoek een oefening" placeholderTextColor={COLORS.mutedText}
                                    value={query} onChangeText={setQuery} returnKeyType="search" />
                            )}
                            <Pressable accessibilityRole="button" accessibilityState={{ selected: onlySelected }}
                                style={[styles.categoryTab, onlySelected && styles.categoryTabSelected]}
                                onPress={() => setOnlySelected(!onlySelected)}>
                                <Text style={styles.categoryTabText}>Gekozen ({selectedIds.size})</Text>
                            </Pressable>
                            {limitReached && <Text style={styles.modalSubtitle}>Maximaal {multiple.limit} oefeningen.</Text>}
                        </View>
                    )}

                    <ScrollView style={styles.exerciseModalScroll} contentContainerStyle={styles.exerciseGrid}
                        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                        {onCreate && (
                            <Pressable accessibilityRole="button" accessibilityLabel="Maak oefening"
                                style={styles.exerciseChoiceCard} onPress={onCreate}>
                                <View style={[styles.exerciseChoiceImage, styles.createImage]}>
                                    <Ionicons name="add-circle-outline" size={46} color={COLORS.primaryLight} />
                                </View>
                                <Text style={styles.exerciseChoiceTitle}>Maak oefening</Text>
                            </Pressable>
                        )}
                        {results.length === 0 && (
                            <Text style={styles.modalEmptyText}>
                                {onlySelected ? "Je hebt nog geen oefeningen gekozen." : "Geen oefeningen gevonden."}
                            </Text>
                        )}
                        {results.map(exercise => {
                            const selected = multiple ? selectedIds.has(exercise.id) : selectedId === String(exercise.id);
                            const disabled = limitReached && !selected;
                            const badge = selected && (
                                <View style={styles.selectedExerciseBadge}>
                                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                                </View>
                            );
                            return (
                                <Pressable key={exercise.id} accessibilityRole={multiple ? "checkbox" : "button"}
                                    accessibilityState={multiple ? { checked: selected, disabled } : { selected }}
                                    accessibilityLabel={exercise.title} disabled={disabled}
                                    style={[styles.exerciseChoiceCard, selected && styles.exerciseChoiceCardSelected,
                                        disabled && styles.disabledCard]}
                                    onPress={() => onSelect(exercise)}>
                                    {exercise.image_url ? (
                                        <ImageBackground source={{ uri: exercise.image_url }}
                                            style={styles.exerciseChoiceImage} imageStyle={styles.exerciseChoiceImageInner}>
                                            {badge}
                                        </ImageBackground>
                                    ) : (
                                        <View style={[styles.exerciseChoiceImage, styles.placeholderImage]}>
                                            <Ionicons name={exercise.isConcept ? "create-outline" : "image-outline"}
                                                size={32} color={COLORS.primaryLight} />
                                            {badge}
                                        </View>
                                    )}
                                    <Text style={styles.exerciseChoiceTitle} numberOfLines={2}>{exercise.title}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.72)",
        alignItems: "center",
        justifyContent: "center",
        padding: 14,
    },
    exerciseModal: {
        width: "100%",
        maxWidth: 980,
        height: "92%",
        backgroundColor: COLORS.background,
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: "hidden",
    },
    modalHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: SPACING.md,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        gap: 12,
    },
    modalHeaderText: {
        flex: 1,
    },
    modalTitle: {
        color: COLORS.text,
        fontSize: 21,
        fontWeight: "900",
        marginBottom: 2,
    },
    modalSubtitle: {
        color: COLORS.mutedText,
        fontSize: 14,
    },
    modalCloseButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: COLORS.surface,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    categoryTabsScroll: {
        flexGrow: 0,
        flexShrink: 0,
        maxHeight: 64,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    categoryTabs: {
        paddingHorizontal: SPACING.md,
        paddingVertical: 10,
        gap: 8,
        alignItems: "center",
        flexGrow: 0,
    },
    categoryTab: {
        height: 42,
        flexGrow: 0,
        flexShrink: 0,
        alignSelf: "center",
        justifyContent: "center",
        paddingHorizontal: 15,
        borderRadius: RADIUS.pill,
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    categoryTabSelected: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    categoryTabText: {
        color: COLORS.text,
        fontSize: 13,
        fontWeight: "700",
    },
    exerciseModalScroll: {
        flex: 1,
    },
    exerciseGrid: {
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 28,
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
        rowGap: 12,
    },
    exerciseChoiceCard: {
        width: "48.5%",
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: "hidden",
        minWidth: 0,
    },
    exerciseChoiceCardSelected: {
        borderColor: COLORS.primaryLight,
        borderWidth: 2,
    },
    exerciseChoiceImage: {
        width: "100%",
        aspectRatio: 1.45,
        alignItems: "flex-end",
        padding: 8,
    },
    exerciseChoiceImageInner: {
        borderTopLeftRadius: RADIUS.lg,
        borderTopRightRadius: RADIUS.lg,
    },
    selectedExerciseBadge: {
        position: "absolute",
        top: 8,
        right: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: COLORS.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    exerciseChoiceTitle: {
        color: COLORS.text,
        fontSize: 14,
        fontWeight: "800",
        lineHeight: 19,
        padding: 10,
    },
    modalEmptyText: {
        width: "100%",
        color: COLORS.mutedText,
        textAlign: "center",
        fontSize: 15,
        lineHeight: 22,
        paddingVertical: SPACING.xl,
    },

    doneButton: {
        minHeight: 44, justifyContent: "center", paddingHorizontal: SPACING.md,
        borderRadius: RADIUS.pill, backgroundColor: COLORS.primary,
    },
    searchRow: {
        flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: SPACING.xs,
        paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
        borderBottomColor: COLORS.border, borderBottomWidth: 1,
    },
    searchInput: {
        flex: 1, minWidth: 120, minHeight: 44, paddingHorizontal: SPACING.sm,
        color: COLORS.text, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm,
        borderColor: COLORS.border, borderWidth: 1,
    },
    placeholderImage: {
        alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surfaceLight,
    },
    createImage: {
        alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surfaceLight,
        borderWidth: 1, borderStyle: "dashed", borderColor: COLORS.primaryLight,
    },
    disabledCard: { opacity: 0.55 },
});
