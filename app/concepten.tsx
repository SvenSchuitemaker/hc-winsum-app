import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import ExerciseBoardEditor, { type ExerciseBoardEditorRef, type ExerciseBoardLayout } from "../components/ExerciseBoardEditor";
import { uploadExerciseBoardPreview } from "../lib/exerciseBoardStorage";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

type Concept = {
  id: string; title: string; category_slug: string; status: string;
  source_image_url: string | null; board_layout: ExerciseBoardLayout;
  subtitle: string | null; explanation: string | null; instructions: string | null;
  simplify: string | null; build_up: string | null; difficulty: string;
  audience: string[]; published_exercise_id: number | null;
};

export default function ConceptenScreen() {
  const { user, role } = useAuth();
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selected, setSelected] = useState<Concept | null>(null);
  const [layout, setLayout] = useState<ExerciseBoardLayout | null>(null);
  const [showExercisePreview, setShowExercisePreview] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editor = useRef<ExerciseBoardEditorRef | null>(null);

  async function reload() {
    if (!supabase || !user?.id) return;
    setLoading(true);
    try {
      const {data,error:fetchError} = await supabase.from("exercise_concepts")
        .select("*").eq("user_id", user.id).order("created_at",{ascending:false});
      if (fetchError) throw fetchError;
      setConcepts((data || []) as Concept[]);
    } catch (e) { setError(e instanceof Error ? e.message : "Concepten laden mislukt."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [user?.id]);

  function open(concept: Concept) {
    setError(""); setSelected(concept);
    // Hydrate the editor with the original photo from the start so its
    // built-in overlay buttons are available immediately above the preview.
    setLayout({...concept.board_layout, backgroundImageUrl: concept.source_image_url, backgroundOpacity: 0.65});
    setShowExercisePreview(true);
  }
  async function reject() {
    if (!supabase || !selected || busy) return;
    setBusy(true); setError("");
    try {
      const {error:updateError} = await supabase.from("exercise_concepts")
        .update({status:"rejected",reviewed_at:new Date().toISOString()})
        .eq("id",selected.id).eq("status","ready");
      if (updateError) throw updateError;
      setSelected(null); await reload();
    } catch(e) { setError(e instanceof Error ? e.message : "Afwijzen mislukt."); }
    finally { setBusy(false); }
  }
  async function approve() {
    if (!supabase || !selected || !layout || !user?.id || busy || selected.status !== "ready") return;
    if (!layout.items.length) {setError("Dit concept heeft geen tekenobjecten.");return;}
    setBusy(true);setError("");
    try {
      // Capture first using the same board renderer as manual drawings.
      // A concept never becomes public without a successfully rendered preview.
      const {data:created,error:insertError}=await supabase.from("exercises").insert({
        title:selected.title,category_slug:selected.category_slug,
        image_url:selected.source_image_url,subtitle:selected.subtitle,
        explanation:selected.explanation,instructions:selected.instructions,
        simplify:selected.simplify,build_up:selected.build_up,
        difficulty:selected.difficulty,audience:selected.audience,
        board_layout:{...layout,backgroundImageUrl:null},
      }).select("id").single();
      if(insertError || !created?.id) throw insertError || new Error("Oefening opslaan mislukt.");
      try {
        const image=await uploadExerciseBoardPreview({
          exerciseId:created.id,title:selected.title,boardRef:editor.current,
        });
        const {error:imageError}=await supabase.from("exercises").update({image_url:image}).eq("id",created.id);
        if(imageError) throw imageError;
      } catch(e) {
        // Never publish a fallback original photo as if it were the AI drawing.
        await supabase.from("exercises").delete().eq("id",created.id);
        throw e;
      }
      const {error:stateError}=await supabase.from("exercise_concepts")
        .update({status:"approved",published_exercise_id:created.id,reviewed_at:new Date().toISOString()})
        .eq("id",selected.id).eq("status","ready");
      if(stateError) throw stateError;
      setSelected(null);setLayout(null);await reload();
    } catch(e) { setError(e instanceof Error ? e.message : "Publiceren mislukt."); }
    finally {setBusy(false);}
  }

  if(role !== "super_admin") return <View style={styles.root}><Text style={styles.body}>Alleen hoofdbeheerders kunnen concepten beoordelen.</Text></View>;
  return <View style={styles.root}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={()=>router.back()}><Text style={styles.link}>← Terug</Text></Pressable>
      <Text style={styles.heading}>AI-concepten</Text>
      <Text style={styles.body}>Bekijk elke tekening. Alleen goedgekeurde concepten worden openbaar.</Text>
      <Pressable onPress={()=>void reload()}><Text style={styles.link}>Vernieuwen</Text></Pressable>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color={COLORS.primaryLight}/>}
      {concepts.map(c=><Pressable key={c.id} style={styles.card} onPress={()=>open(c)}>
        <Text style={styles.title}>{c.title}</Text>
        <Text style={styles.body}>{c.category_slug} · {c.status==="ready"?"Wacht op controle":c.status==="approved"?"Goedgekeurd":"Afgewezen"}</Text>
        {c.source_image_url && <Image source={{uri:c.source_image_url}} style={styles.thumb} resizeMode="contain"/>}
        <Text style={styles.link}>Bekijk tekening →</Text>
      </Pressable>)}
      {!loading && !concepts.length && <Text style={styles.body}>Nog geen concepten. Kies eerst maximaal 20 afbeeldingen.</Text>}
    </ScrollView>
    <Modal visible={!!selected} animationType="slide" onRequestClose={()=>{if(!busy)setSelected(null);}}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>{selected?.title}</Text>
        <Text style={styles.body}>{selected?.explanation || "Geen beschrijving gevonden."}</Text>
        {!!selected?.source_image_url && <>
          <Text style={styles.title}>Originele foto</Text>
          <Image source={{uri:selected.source_image_url}} resizeMode="contain" style={styles.original}/>
        </>}
        <Text style={styles.title}>Voorbeeld zoals in de oefeningenbibliotheek</Text>
        <Pressable onPress={()=>setShowExercisePreview(value=>!value)}>
          <Text style={styles.link}>{showExercisePreview ? "Verberg oefeninggegevens" : "Toon oefeninggegevens"}</Text>
        </Pressable>
        {showExercisePreview && <View style={styles.previewCard}>
          <Text style={styles.heading}>{selected?.title}</Text>
          {!!selected?.subtitle && <Text style={styles.subtitle}>{selected.subtitle}</Text>}
          <View style={styles.badges}>
            {!!selected?.difficulty && <Text style={styles.badge}>{selected.difficulty}</Text>}
            {selected?.audience?.map(age=><Text key={age} style={styles.badge}>{age}</Text>)}
          </View>
          {([
            ["Uitleg", selected?.explanation],
            ["Instructies", selected?.instructions],
            ["Vereenvoudiging", selected?.simplify],
            ["Uitbouw", selected?.build_up],
          ] as const).map(([name, value]) => value ? <View key={name} style={styles.detailSection}>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.body}>{value}</Text>
          </View> : null)}
        </View>}
        <Text style={styles.title}>Bewerkbare AI-tekening</Text>
        <Text style={styles.body}>Gebruik direct boven het veld 'Klaar met overtrekken' of 'Toon foto om bij te stellen'. De originele foto is alleen een hulpmiddel en wordt niet gepubliceerd.</Text>
        {layout && <ExerciseBoardEditor key={selected?.id} ref={editor}
          value={layout}
          onChange={setLayout}/>}


        {!!error && <Text style={styles.error}>{error}</Text>}
        {busy && <ActivityIndicator color={COLORS.primaryLight}/>}
        {selected?.status==="ready" && <>
          <Pressable style={styles.button} disabled={busy} onPress={()=>void approve()}><Text style={styles.buttonText}>Goedkeuren en openbaar plaatsen</Text></Pressable>
          <Pressable style={styles.button} disabled={busy} onPress={()=>void reject()}><Text style={styles.buttonText}>Afwijzen</Text></Pressable>
        </>}
        <Pressable style={styles.button} disabled={busy} onPress={()=>{setSelected(null);setLayout(null);setError("");}}>
          <Text style={styles.buttonText}>Sluiten</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  </View>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:COLORS.background},
 content:{padding:SPACING.md,paddingBottom:SPACING.xxl,gap:12},
 heading:{fontSize:24,fontWeight:"800",color:COLORS.text},
 title:{fontSize:17,fontWeight:"700",color:COLORS.text},
 body:{color:COLORS.mutedText,fontSize:14},
 error:{color:"#F47777"},
 link:{color:COLORS.primaryLight,fontWeight:"700",marginVertical:6},
 card:{padding:SPACING.md,borderRadius:RADIUS.lg,backgroundColor:COLORS.surface,gap:8},
 previewCard:{padding:SPACING.md,borderRadius:RADIUS.lg,backgroundColor:COLORS.surface,gap:10},
 subtitle:{color:COLORS.primaryLight,fontSize:16,fontWeight:"700"},
 badges:{flexDirection:"row",flexWrap:"wrap",gap:8},
 badge:{color:COLORS.accent,backgroundColor:COLORS.surfaceLight,padding:9,borderRadius:RADIUS.pill,overflow:"hidden"},
 detailSection:{padding:SPACING.md,backgroundColor:COLORS.surfaceLight,borderRadius:RADIUS.md,gap:8},
 overlayButtons:{flexDirection:"row",gap:10},
 smallButton:{flex:1,backgroundColor:COLORS.primary,borderRadius:RADIUS.md,padding:12,alignItems:"center"},
 thumb:{height:110,width:"100%"},
 original:{height:240,width:"100%"},
 button:{backgroundColor:COLORS.primary,borderRadius:RADIUS.md,padding:15,alignItems:"center"},
 buttonText:{color:COLORS.text,fontWeight:"800"},
});
