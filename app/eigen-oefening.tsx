import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import ExerciseBoardEditor, { type ExerciseBoardEditorRef, type ExerciseBoardLayout } from "../components/ExerciseBoardEditor";
import { createEmptyBoardLayout, uploadExerciseBoardPreview } from "../lib/exerciseBoardStorage";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { setCreatedTrainerExercise } from "../lib/trainerExerciseSelection";
import { supabase } from "../lib/supabase";

type Category = { slug: string; title: string };
const DIFFICULTIES = ["Makkelijk", "Gemiddeld", "Moeilijk"];
const AGE_GROUPS = ["JO8", "JO10", "JO12", "JO14", "JO16", "JO18", "MO8", "MO10", "MO12", "MO14", "MO16", "MO18", "Senioren"];

export default function EigenOefeningScreen() {
    const { user } = useAuth();
    const { blockId, id } = useLocalSearchParams<{ blockId?: string; id?: string }>();
    const [categories, setCategories] = useState<Category[]>([]);
    const [category, setCategory] = useState("");
    const [title, setTitle] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [explanation, setExplanation] = useState("");
    const [instructions, setInstructions] = useState("");
    const [simplify, setSimplify] = useState("");
    const [buildUp, setBuildUp] = useState("");
    const [difficulty, setDifficulty] = useState("Gemiddeld");
    const [audience, setAudience] = useState<string[]>([]);
    const [layout, setLayout] = useState<ExerciseBoardLayout>(() => createEmptyBoardLayout());
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const boardKey = useRef(0);
    const boardRef = useRef<ExerciseBoardEditorRef | null>(null);

    useEffect(() => {
        let active = true;
        async function initialize() {
            if (!supabase || !user) { if (active) setLoading(false); return; }
            try {
                const { data, error: categoryError } = await supabase.from("categories").select("slug, title").order("id");
                if (categoryError) throw categoryError;
                if (!active) return;
                setCategories((data || []) as Category[]);
                setCategory((data || [])[0]?.slug || "");
                if (id) {
                    const { data: draft, error: draftError } = await supabase.from("exercise_concepts")
                        .select("*").eq("id", id).eq("user_id", user.id).single();
                    if (draftError) throw draftError;
                    if (!active) return;
                    setTitle(draft.title);
                    setCategory(draft.category_slug);
                    setSubtitle(draft.subtitle || "");
                    setExplanation(draft.explanation || "");
                    setInstructions(draft.instructions || "");
                    setSimplify(draft.simplify || "");
                    setBuildUp(draft.build_up || "");
                    setDifficulty(draft.difficulty || "Gemiddeld");
                    setAudience(draft.audience || []);
                    setLayout(draft.board_layout);
                    boardKey.current++;
                }
            } catch (reason) {
                if (active) setError(reason instanceof Error ? reason.message : "Oefening laden mislukt.");
            } finally { if (active) setLoading(false); }
        }
        void initialize();
        return () => { active = false; };
    }, [id, user?.id]);

    async function save() {
        if (!supabase || !user?.id || busy) return;
        if (!title.trim() || !category) { setError("Vul een titel en categorie in."); return; }
        if (!layout.items.length) { setError("Teken minimaal één speler, pylon of lijn op het veld."); return; }
        setBusy(true); setError("");
        const payload = {
            title: title.trim(), category_slug: category, subtitle: subtitle.trim() || null,
            explanation: explanation.trim() || null, instructions: instructions.trim() || null,
            simplify: simplify.trim() || null, build_up: buildUp.trim() || null,
            difficulty, audience, board_layout: { ...layout, backgroundImageUrl: null },
        };
        let insertedId: string | null = null;
        try {
            const { error: schemaError } = await supabase.from("exercise_concepts").select("preview_image_path").limit(0);
            if (schemaError) throw new Error("De database-update voor getekende oefeningafbeeldingen ontbreekt nog. Er is niets opgeslagen.");
            if (!boardRef.current) throw new Error("Het tekenbord is nog niet klaar om op te slaan.");

            let conceptKey = id;
            if (!conceptKey) {
                const { data, error: insertError } = await supabase.from("exercise_concepts")
                    .insert({ ...payload, user_id: user.id, status: "ready" }).select("id").single();
                if (insertError || !data?.id) throw insertError || new Error("Concept aanmaken mislukt.");
                conceptKey = data.id;
                insertedId = data.id;
            }
            // Persist a real PNG from the same board renderer used by public exercises.
            // The preview stays in a private bucket and is not published with the concept.
            const previewPath = await uploadExerciseBoardPreview({
                exerciseId: Date.now(), title: title.trim(), boardRef: boardRef.current,
                boardLayout: layout, privatePathPrefix: `${user.id}/${conceptKey}`,
            });
            const { data: saved, error: saveError } = await supabase.from("exercise_concepts")
                .update({ ...payload, preview_image_path: previewPath })
                .eq("id", conceptKey).eq("user_id", user.id).eq("status", "ready")
                .select("id").single();
            if (saveError || !saved?.id) throw saveError || new Error("Concept kon niet worden bijgewerkt.");
            if (blockId) setCreatedTrainerExercise(blockId, saved.id);
            Alert.alert("Opgeslagen", "Je oefening is privé opgeslagen als concept en wacht op goedkeuring.");
            router.back();
        } catch (reason) {
            if (insertedId) await supabase.from("exercise_concepts").delete().eq("id", insertedId).eq("user_id", user.id);
            setError(reason instanceof Error ? reason.message : "Oefening opslaan mislukt.");
        } finally { setBusy(false); }
    }

    if (loading) return <View style={styles.center}><ActivityIndicator color={COLORS.primaryLight} /></View>;
    if (!user) return <View style={styles.center}><Text style={styles.text}>Log in om je eigen oefening te maken.</Text></View>;
    return <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" color={COLORS.text} size={20}/><Text style={styles.text}>Terug</Text></Pressable>
        <Text style={styles.heading}>{id ? "Eigen oefening bekijken of aanpassen" : "Maak oefening"}</Text>
        <Text style={styles.help}>Deze oefening en de getekende afbeelding zijn privé totdat een hoofdtrainer het concept goedkeurt. Na opslaan kies je nog "Training opslaan" in de trainingbouwer.</Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.label}>Titel</Text><TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Naam van je oefening" placeholderTextColor={COLORS.mutedText}/>
        <Text style={styles.label}>Categorie</Text><View style={styles.picker}><Picker selectedValue={category} onValueChange={setCategory}>{categories.map(item=><Picker.Item key={item.slug} label={item.title} value={item.slug}/>)}</Picker></View>
        <Text style={styles.label}>Korte omschrijving</Text><TextInput style={styles.input} value={subtitle} onChangeText={setSubtitle} placeholder="Trainingsdoel" placeholderTextColor={COLORS.mutedText}/>
        <Text style={styles.label}>Uitleg</Text><TextInput style={[styles.input,styles.multiline]} multiline value={explanation} onChangeText={setExplanation} placeholder="Opstelling en verloop" placeholderTextColor={COLORS.mutedText}/>
        <Text style={styles.label}>Instructies</Text><TextInput style={[styles.input,styles.multiline]} multiline value={instructions} onChangeText={setInstructions} placeholder="Aanwijzingen voor de spelers" placeholderTextColor={COLORS.mutedText}/>
        <Text style={styles.label}>Makkelijker maken</Text><TextInput style={styles.input} value={simplify} onChangeText={setSimplify}/>
        <Text style={styles.label}>Moeilijker maken</Text><TextInput style={styles.input} value={buildUp} onChangeText={setBuildUp}/>
        <Text style={styles.label}>Moeilijkheid</Text><View style={styles.picker}><Picker selectedValue={difficulty} onValueChange={setDifficulty}>{DIFFICULTIES.map(x=><Picker.Item key={x} label={x} value={x}/>)}</Picker></View>
        <Text style={styles.label}>Leeftijdsgroepen</Text><View style={styles.ages}>{AGE_GROUPS.map(group=><Pressable key={group} onPress={()=>setAudience(current=>current.includes(group)?current.filter(x=>x!==group):[...current,group])} style={[styles.age,audience.includes(group)&&styles.active]}><Text style={styles.text}>{group}</Text></Pressable>)}</View>
        <Text style={styles.label}>Teken je oefening</Text>
        <ExerciseBoardEditor key={boardKey.current} ref={boardRef} value={layout} onChange={setLayout}/>
        <Pressable style={styles.save} disabled={busy} onPress={()=>void save()}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.saveText}>Oefening als privéconcept opslaan</Text>}</Pressable>
    </ScrollView>;
}

const styles = StyleSheet.create({
    root:{flex:1,backgroundColor:COLORS.background},
    content:{padding:SPACING.md,paddingBottom:SPACING.xxl,maxWidth:960,width:"100%",alignSelf:"center"},
    center:{flex:1,justifyContent:"center",alignItems:"center",backgroundColor:COLORS.background},
    back:{flexDirection:"row",gap:8,alignItems:"center",marginBottom:16},
    heading:{color:COLORS.text,fontSize:24,fontWeight:"900",marginBottom:8},
    text:{color:COLORS.text,fontWeight:"700"},
    help:{color:COLORS.mutedText,marginBottom:20},
    error:{color:"#FF8080",marginVertical:12},
    label:{color:COLORS.text,fontWeight:"800",marginTop:15,marginBottom:7},
    input:{color:COLORS.text,backgroundColor:COLORS.surface,borderRadius:RADIUS.md,borderWidth:1,borderColor:COLORS.border,padding:12,minHeight:46},
    multiline:{minHeight:90,textAlignVertical:"top"},
    picker:{backgroundColor:COLORS.surface,borderRadius:RADIUS.md,overflow:"hidden"},
    ages:{flexDirection:"row",flexWrap:"wrap",gap:8},
    age:{padding:10,backgroundColor:COLORS.surface,borderRadius:RADIUS.md,borderWidth:1,borderColor:COLORS.border},
    active:{borderColor:COLORS.primaryLight,backgroundColor:COLORS.surfaceLight},
    save:{backgroundColor:COLORS.primary,borderRadius:RADIUS.md,padding:16,alignItems:"center",marginTop:24},
    saveText:{color:"#FFFFFF",fontWeight:"900"},
});
