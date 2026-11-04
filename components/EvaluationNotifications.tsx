import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

type EvaluationNotice = { id: string; body: string; target_path: string };

export default function EvaluationNotifications() {
    const { user, role } = useAuth();
    const [items, setItems] = useState<EvaluationNotice[]>([]);
    const [errorText, setErrorText] = useState("");
    const canView = role === "head_trainer" || role === "super_admin";

    useFocusEffect(useCallback(() => {
        let active = true;
        setItems([]);
        if (!user || !canView || !supabase) return;
        const client = supabase;
        async function load() {
            const { data, error } = await client.from("app_notifications")
                .select("id,body,target_path").eq("user_id", user!.id)
                .eq("kind", "evaluation").is("read_at", null)
                .order("created_at", { ascending: false }).limit(3);
            if (!active) return;
            setErrorText(error ? "Evaluatiemeldingen konden niet worden geladen." : "");
            if (!error) setItems(data || []);
        }
        void load();
        const timer = setInterval(() => void load(), 30000);
        return () => { active = false; clearInterval(timer); };
    }, [user?.id, canView]));

    async function open(item: EvaluationNotice) {
        if (!supabase || !user) return;
        const { error } = await supabase.from("app_notifications")
            .update({ read_at: new Date().toISOString() }).eq("id", item.id).eq("user_id", user.id);
        if (!error) setItems(current => current.filter(row => row.id !== item.id));
        router.push(item.target_path as any);
    }

    if (!canView || (!items.length && !errorText)) return null;
    return <View style={styles.card}>
        <Text style={styles.title}><Ionicons name="notifications-outline" size={20} /> Nieuwe evaluaties</Text>
        {!!errorText && <Text style={styles.body}>{errorText}</Text>}
        {items.map(item => <Pressable key={item.id} style={styles.item} onPress={() => void open(item)}>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.link}>Evaluatie bekijken →</Text>
        </Pressable>)}
        <Pressable onPress={() => router.push("/notifications")}>
            <Text style={styles.link}>Alle meldingen bekijken</Text>
        </Pressable>
    </View>;
}
const styles = StyleSheet.create({
    card: { padding: SPACING.lg, marginBottom: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.primaryLight },
    title: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
    item: { marginVertical: SPACING.sm },
    body: { color: COLORS.text, lineHeight: 22 },
    link: { color: COLORS.primaryLight, fontWeight: "700", marginTop: 8 },
});
