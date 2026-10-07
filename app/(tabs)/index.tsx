import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
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
    const { width } = useWindowDimensions();
    const isCompact = width <= 390;

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
        <ScrollView
            style={styles.container}
            contentContainerStyle={[
                styles.content,
                isCompact && styles.contentCompact,
            ]}
        >
            <View style={styles.pageContent}>
                <View style={[styles.hero, isCompact && styles.heroCompact]}>
                    <Image
                        source={require("../../assets/images/club-logo.png")}
                        style={[styles.logo, isCompact && styles.logoCompact]}
                        resizeMode="contain"
                    />

                    <Text style={[styles.clubName, isCompact && styles.clubNameCompact]}>
                        H.C. Winsum
                    </Text>
                    <Text style={[styles.subtitle, isCompact && styles.subtitleCompact]}>
                        Trainingen, oefeningen en teamontwikkeling
                    </Text>

                    <View style={[styles.infoCard, isCompact && styles.infoCardCompact]}>
                        <Text style={[styles.infoTitle, isCompact && styles.infoTitleCompact]}>
                            Welkom in de clubapp
                        </Text>
                        <Text style={[styles.infoText, isCompact && styles.infoTextCompact]}>
                            Kies een categorie en bekijk oefeningen voor trainingen, techniek en spelsituaties.
                        </Text>
                    </View>
                </View>

                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, isCompact && styles.sectionTitleCompact]}>
                        Categorieën
                    </Text>
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
    contentCompact: {
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 28,
    },
    pageContent: {
        width: "100%",
        maxWidth: 1200,
        alignSelf: "center",
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
    heroCompact: {
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.lg,
    },
    logo: {
        width: 120,
        height: 120,
        marginBottom: SPACING.sm,
    },
    logoCompact: {
        width: 92,
        height: 92,
        marginBottom: 6,
    },
    clubName: {
        color: COLORS.text,
        fontSize: 30,
        fontWeight: "900",
        marginBottom: 4,
    },
    clubNameCompact: {
        fontSize: 26,
    },
    subtitle: {
        color: COLORS.primaryLight,
        fontSize: 15,
        fontWeight: "700",
        marginBottom: SPACING.lg,
        textAlign: "center",
    },
    subtitleCompact: {
        fontSize: 14,
        marginBottom: SPACING.md,
        paddingHorizontal: 4,
    },
    infoCard: {
        width: "100%",
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    infoCardCompact: {
        borderRadius: RADIUS.md,
        padding: 12,
    },
    infoTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "800",
        marginBottom: 6,
    },
    infoTitleCompact: {
        fontSize: 16,
    },
    infoText: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
    },
    infoTextCompact: {
        fontSize: 14,
        lineHeight: 20,
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
    sectionTitleCompact: {
        fontSize: 20,
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
