import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import ExerciseCard from "../../components/ExerciseCard";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

type DbCategory = {
    id: number;
    slug: string;
    title: string;
    image_url: string | null;
    description: string | null;
};

export default function HomeScreen() {
    const router = useRouter();

    const [categories, setCategories] = useState<DbCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorText, setErrorText] = useState("");

    useEffect(() => {
        loadCategories();
    }, []);

    async function loadCategories() {
        try {
            if (!supabase) {
                setErrorText("Supabase is niet geladen.");
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from("categories")
                .select("*")
                .order("id", { ascending: true });

            if (error) {
                setErrorText(error.message);
            } else {
                setCategories(data || []);
            }
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "Onbekende fout");
        } finally {
            setLoading(false);
        }
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.hero}>
                <Image
                    source={require("../../assets/images/club-logo.png")}
                    style={styles.logo}
                    resizeMode="contain"
                />

                <Text style={styles.clubName}>H.C. Winsum</Text>
                <Text style={styles.subtitle}>Trainingen, oefeningen en teamontwikkeling</Text>

                <View style={styles.infoCard}>
                    <Text style={styles.infoTitle}>Welkom in de clubapp</Text>
                    <Text style={styles.infoText}>
                        Kies een categorie en bekijk oefeningen voor trainingen, techniek en spelsituaties.
                    </Text>
                </View>
            </View>

            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Categorieën</Text>
                <Text style={styles.sectionText}>Selecteer een onderdeel om te beginnen</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={COLORS.primary} />
            ) : errorText ? (
                <Text style={styles.errorText}>{errorText}</Text>
            ) : (
                <View style={styles.grid}>
                    {categories.map((item) => (
                        <ExerciseCard
                            key={item.id}
                            title={item.title}
                            image={item.image_url || "https://picsum.photos/600/400?random=99"}
                            onPress={() => router.push(`/category/${item.slug}`)}
                        />
                    ))}
                </View>
            )}
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
    hero: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        marginBottom: SPACING.xl,
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: "center",
    },
    logo: {
        width: 120,
        height: 120,
        marginBottom: SPACING.sm,
    },
    clubName: {
        color: COLORS.text,
        fontSize: 30,
        fontWeight: "900",
        marginBottom: 4,
    },
    subtitle: {
        color: COLORS.primaryLight,
        fontSize: 15,
        fontWeight: "700",
        marginBottom: SPACING.lg,
        textAlign: "center",
    },
    infoCard: {
        width: "100%",
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    infoTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "800",
        marginBottom: 6,
    },
    infoText: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
    },
    sectionHeader: {
        marginBottom: SPACING.md,
    },
    sectionTitle: {
        color: COLORS.text,
        fontSize: 22,
        fontWeight: "900",
        marginBottom: 4,
    },
    sectionText: {
        color: COLORS.mutedText,
        fontSize: 14,
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
    },
    errorText: {
        color: "#ff7b7b",
        fontSize: 16,
        lineHeight: 24,
    },
});