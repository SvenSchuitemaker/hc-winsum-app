import { encode } from "base64-arraybuffer";
import { analyzeExercisePhoto } from "../lib/exercisePhotoImport";
import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import ExerciseBoardEditor, { type ExerciseBoardEditorRef, type ExerciseBoardLayout } from "../components/ExerciseBoardEditor";
import { uploadExerciseBoardPreview } from "../lib/exerciseBoardStorage";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

type Concept = {
  id: string; user_id: string; title: string; category_slug: string; status: string;
  source_image_url: string | null; board_layout: ExerciseBoardLayout;
  subtitle: string | null; explanation: string | null; instructions: string | null;
  simplify: string | null; build_up: string | null; difficulty: string;
  audience: string[]; published_exercise_id: number | null;
};

export default function ConceptenScreen() {
  const { user, role } = useAuth();
  const { width: viewportWidth } = useWindowDimensions();
  const desktop = viewportWidth >= 1050;
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selected, setSelected] = useState<Concept | null>(null);
  const [layout, setLayout] = useState<ExerciseBoardLayout | null>(null);
  const [showExercisePreview, setShowExercisePreview] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationVersion, setCalibrationVersion] = useState(0);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const editor = useRef<ExerciseBoardEditorRef | null>(null);
  const handleBoardChange = useCallback((next: ExerciseBoardLayout) => {
    setSaveMessage("");
    setLayout(next);
  }, []);

  async function reload() {
    if (!supabase || !user?.id) return;
    setLoading(true);
    try {
      const {data,error:fetchError} = await supabase.from("exercise_concepts")
        .select("*").in("status", ["ready", "rejected"]).order("created_at",{ascending:false});
      if (fetchError) throw fetchError;
      setConcepts(((data || []) as Concept[]).filter(concept => concept.status !== "approved"));
    } catch (e) { setError(e instanceof Error ? e.message : "Concepten laden mislukt."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [user?.id]);

  function open(concept: Concept) {
    setError(""); setSaveMessage(""); setSelected(concept);
    // Hydrate the editor with the original photo from the start so its
    // built-in overlay buttons are available immediately above the preview.
    setLayout({...concept.board_layout, backgroundImageUrl: concept.source_image_url, backgroundOpacity: 0.65});
    setShowExercisePreview(true);
  }
  async function recalibrateField() {
    if (!supabase || !selected?.source_image_url || !layout || calibrating || busy) return;
    setCalibrating(true);
    setError("");
    try {
      // Recover only geometry for an older concept. Never replace its edited
      // players, cones, arrows or text with a second AI interpretation.
      const response = await fetch(selected.source_image_url);
      if (!response.ok) throw new Error("Originele foto kan niet worden opgehaald.");
      const imageData = await response.arrayBuffer();
      if (imageData.byteLength > 5_250_000) throw new Error("Originele foto is te groot om opnieuw te analyseren.");
      const contentType = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      const mimeType = ["image/jpeg", "image/png", "image/webp"].includes(contentType) ? contentType : "image/jpeg";
      const analysis = await analyzeExercisePhoto({
        uri: selected.source_image_url,
        mimeType,
        base64: encode(imageData),
      });
      const calibration = analysis.field_calibration ?? analysis.board_layout.backgroundCalibration;
      if (!calibration) throw new Error("AI kon geen veldgrenzen bepalen.");
      const next = {...layout, backgroundCalibration: calibration};
      const {error:saveError} = await supabase.from("exercise_concepts")
        .update({board_layout:{...next,backgroundImageUrl:null}}).eq("id",selected.id).eq("status","ready");
      if (saveError) throw saveError;
      setLayout(next);
      // The editor only hydrates calibration on mount, so reopen the concept
      // with the saved geometry after the state update.
      setSelected({...selected, board_layout:{...next,backgroundImageUrl:null}});
      setCalibrationVersion(version=>version+1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Veldgrenzen bepalen mislukt.");
    } finally { setCalibrating(false); }
  }

  function adjustCrop(edge: "left" | "right" | "top" | "bottom", delta: number) {
    if (!layout) return;
    const previous = layout.backgroundCalibration ?? {
      bounds:{left:0,top:0,right:1,bottom:1},rotation:0,flipHorizontal:false,
    };
    const bounds = {...previous.bounds};
    const proposed = Math.max(0,Math.min(1,bounds[edge] + delta));
    if (edge === "left" && proposed >= bounds.right - 0.18) return;
    if (edge === "right" && proposed <= bounds.left + 0.18) return;
    if (edge === "top" && proposed >= bounds.bottom - 0.18) return;
    if (edge === "bottom" && proposed <= bounds.top + 0.18) return;
    bounds[edge] = Math.round(proposed*100)/100;
    setLayout({...layout,backgroundCalibration:{...previous,bounds}});
    setCalibrationVersion(v=>v+1);
  }
  async function saveCrop() {
    if (!supabase || !selected || !layout) return;
    setBusy(true);setError("");setSaveMessage("");
    try {
      const latest = editor.current?.getLayout() ?? layout;
      const savedLayout = {...latest, backgroundImageUrl:null};
      const {data:saved,error:saveError} = await supabase.from("exercise_concepts")
        .update({board_layout:savedLayout})
        .eq("id",selected.id).eq("status","ready")
        .select("id,board_layout").single();
      if (saveError || !saved) throw saveError ?? new Error("De tekening is niet opgeslagen.");
      if (saved.board_layout?.items?.length !== latest.items.length) {
        throw new Error("De opgeslagen tekening is onvolledig.");
      }
      setLayout(latest);
      setSelected(current => current ? {...current, board_layout:savedLayout} : current);
      setSaveMessage("Tekening opgeslagen. Je kunt deze later opnieuw openen of goedkeuren.");
    } catch(e) {setError(e instanceof Error ? e.message : "Tekening opslaan mislukt.");}
    finally {setBusy(false);}
  }
    async function deleteRejected(concept: Concept) {
    if (!supabase || !user?.id || busy || concept.status !== "rejected") return;
    setBusy(true);setError("");
    try {
      const {data,error:deleteError}=await supabase.from("exercise_concepts")
        .delete().eq("id",concept.id).eq("user_id",user.id)
        .eq("status","rejected").select("id");
      if(deleteError)throw deleteError;
      if(!data?.some(row=>row.id===concept.id))throw new Error("Het afgewezen concept kon niet worden verwijderd.");
      setConcepts(current=>current.filter(item=>item.id!==concept.id));
      if(selected?.id===concept.id){setSelected(null);setLayout(null);}
    }catch(error){setError(error instanceof Error?error.message:"Verwijderen mislukt.");}
    finally{setBusy(false);}
  }
  async function reject() {
    if (!supabase || !selected || busy || selected.status !== "ready") return;
    setBusy(true); setError("");
    try {
      const {data, error:deleteError} = await supabase.from("exercise_concepts")
        .delete().eq("id",selected.id).eq("user_id",user?.id).eq("status","ready")
        .select("id");
      if (deleteError) throw deleteError;
      if (!data?.some(row=>row.id===selected.id)) throw new Error("Concept kon niet worden verwijderd. Controleer je rechten.");
      setConcepts(current=>current.filter(concept=>concept.id!==selected.id));
      setSelected(null);setLayout(null);
    } catch(e) { setError(e instanceof Error ? e.message : "Concept verwijderen mislukt."); }
    finally { setBusy(false); }
  }
    async function approve() {
    if (!supabase || !selected || !layout || !user?.id || busy || selected.status !== "ready") return;
    const latest = editor.current?.getLayout() ?? layout;
    if (!latest.items.length) {setError("Dit concept heeft geen tekenobjecten.");return;}
    setBusy(true);setError("");
    try {
      // Upload the rendered drawing before publication. The database RPC
      // checks reviewer permissions and publishes the exercise atomically.
      const image=await uploadExerciseBoardPreview({
        exerciseId:Date.now(),title:selected.title,boardRef:editor.current,boardLayout:latest,
      });
      if (!image || image.includes("/imports/")) throw new Error("Geen getekende bordafbeelding ontvangen.");

      // The preview is rendered from the edited layout in React state. Persist
      // that exact layout before the publication RPC reads the concept row.
      // Otherwise the public PNG is correct while its editable board remains
      // the original AI-generated draft.
      const publishedLayout = {...latest, backgroundImageUrl:null};
      const {data:savedConcept,error:layoutError}=await supabase.from("exercise_concepts")
        .update({board_layout:publishedLayout})
        .eq("id",selected.id).eq("status","ready")
        .select("id,board_layout").single();
      if (layoutError || !savedConcept) {
        throw new Error("De aangepaste tekening kon niet worden opgeslagen. De oefening is niet gepubliceerd.");
      }
      if (savedConcept.board_layout?.items?.length !== publishedLayout.items.length ||
          publishedLayout.items.some((item,index) => savedConcept.board_layout.items[index]?.id !== item.id)) {
        throw new Error("De opgeslagen tekening wijkt af van de preview. De oefening is niet gepubliceerd.");
      }

      const {error:publishError}=await supabase.rpc("approve_trainer_exercise", {
        p_concept_id:selected.id, p_image_url:image,
      });
      if (publishError) throw publishError;
      setConcepts(current => current.filter(concept => concept.id !== selected.id));
      setSelected(null);setLayout(null);await reload();
    } catch(e) { setError(e instanceof Error ? e.message : "Publiceren mislukt."); }
    finally {setBusy(false);}
  }

  if(role !== "super_admin" && role !== "head_trainer") return <View style={styles.root}><Text style={styles.body}>Alleen hoofdtrainers en beheerders kunnen concepten beoordelen.</Text></View>;
  return <View style={styles.root}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable style={styles.backButton} onPress={()=>router.replace("/(tabs)/nieuwe-oefeningen" as never)}><Ionicons name="arrow-back" size={20} color={COLORS.text}/><Text style={styles.backText}>Terug naar nieuwe oefening</Text></Pressable>
      <Text style={styles.heading}>Oefeningconcepten beoordelen</Text>
      <Text style={styles.body}>Bekijk elke tekening. Alleen goedgekeurde concepten worden openbaar.</Text>
      <Pressable onPress={()=>void reload()}><Text style={styles.link}>Vernieuwen</Text></Pressable>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color={COLORS.primaryLight}/>}
      <View style={[styles.conceptList, desktop && styles.conceptListDesktop]}>
      {concepts.map(c=><Pressable key={c.id} style={[styles.card, desktop && styles.conceptCardDesktop]} onPress={()=>open(c)}>
        <Text style={styles.title}>{c.title}</Text>
        <Text style={styles.body}>{c.category_slug} · {c.status==="ready"?"Wacht op controle":c.status==="approved"?"Goedgekeurd":"Afgewezen"}</Text>
        {c.source_image_url && <Image source={{uri:c.source_image_url}} style={styles.thumb} resizeMode="contain"/>}
        {c.status==="rejected" && c.user_id === user?.id ? <Pressable style={styles.deleteButton} disabled={busy} accessibilityRole="button" accessibilityLabel="Afgewezen concept verwijderen"
          onPress={(event)=>{event.stopPropagation();void deleteRejected(c);}}>
          <Ionicons name="trash-outline" size={20} color="#FFFFFF"/>
        </Pressable> : <Text style={styles.link}>Bekijk tekening →</Text>}
      </Pressable>)}
      </View>
      {!loading && !concepts.length && <Text style={styles.body}>Nog geen concepten. Kies eerst maximaal 20 afbeeldingen.</Text>}
    </ScrollView>
    <Modal visible={!!selected} animationType="slide" onRequestClose={()=>{if(!busy)setSelected(null);}}>
      <ScrollView style={styles.root} contentContainerStyle={[styles.content, desktop && styles.desktopModalContent]}>
        <Pressable style={styles.backButton} disabled={busy} onPress={()=>{setSelected(null);setLayout(null);setError("");}}><Ionicons name="arrow-back" size={20} color={COLORS.text}/><Text style={styles.backText}>Terug naar concepten</Text></Pressable>
        <View style={[styles.reviewColumns, desktop && styles.reviewColumnsDesktop]}>
          <View style={[styles.editorColumn, desktop && styles.editorColumnDesktop]}>
            <Text style={styles.title}>Tekenveld controleren en bewerken</Text>
        <Text style={styles.body}>Gebruik direct boven het veld 'Klaar met overtrekken' of 'Toon foto om bij te stellen'. De originele foto is alleen een hulpmiddel en wordt niet gepubliceerd.</Text>
        {layout && <ExerciseBoardEditor key={selected?.id + "-" + calibrationVersion} ref={editor}
          value={layout}
          onChange={handleBoardChange}/>}
          </View>
          <View style={[styles.detailsColumn, desktop && styles.detailsColumnDesktop]}>
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
        {selected?.status==="ready" && (
          <Pressable style={styles.button} disabled={calibrating || busy}
            onPress={()=>void recalibrateField()}>
            <Text style={styles.buttonText}>{calibrating ? "Veld uitsnijden…" : "Veld opnieuw automatisch uitsnijden"}</Text>
          </Pressable>
        )}
        {!layout?.backgroundCalibration && (
          <Text style={styles.body}>Dit concept is opgeslagen zonder veldgrenzen. Bepaal deze opnieuw om de foto-overlay correct uit te lijnen.</Text>
        )}
        {!!selected?.source_image_url && selected.status==="ready" && <View style={styles.previewCard}>
          <Text style={styles.title}>Foto uitsnijden naar het hockeyveld</Text>
          <Text style={styles.body}>Stel de vier randen bij totdat uitsluitend het veld uit de boekfoto zichtbaar is. De AI-tekening verandert niet.</Text>
          {(["left","right","top","bottom"] as const).map(edge=><View key={edge} style={styles.cropRow}>
            <Text style={[styles.body,{width:67}]}>{({left:"Links",right:"Rechts",top:"Boven",bottom:"Onder"})[edge]}</Text>
            <Pressable style={styles.cropButton} onPress={()=>adjustCrop(edge,edge==="right"||edge==="bottom"?-0.03:0.03)}>
              <Text style={styles.buttonText}>Meer</Text>
            </Pressable>
            <Pressable style={styles.cropButton} onPress={()=>adjustCrop(edge,edge==="right"||edge==="bottom"?0.03:-0.03)}>
              <Text style={styles.buttonText}>Minder</Text>
            </Pressable>
          </View>)}
          <Pressable style={styles.button} disabled={busy} onPress={()=>void saveCrop()}>
            <Text style={styles.buttonText}>Tekening en uitsnede opslaan</Text>
          </Pressable>
        </View>}




        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!saveMessage && <Text style={styles.body}>{saveMessage}</Text>}
        {busy && <ActivityIndicator color={COLORS.primaryLight}/>}
        {selected?.status==="ready" && <>
          <Pressable style={styles.button} disabled={busy} onPress={()=>void saveCrop()}><Text style={styles.buttonText}>Bewerkte tekening opslaan</Text></Pressable>
          <Pressable style={styles.button} disabled={busy} onPress={()=>void approve()}><Text style={styles.buttonText}>Goedkeuren en openbaar plaatsen</Text></Pressable>
          <Pressable style={styles.button} disabled={busy} onPress={()=>void reject()}><Text style={styles.buttonText}>Afwijzen en verwijderen</Text></Pressable>
        </>}
        <Pressable style={styles.button} disabled={busy} onPress={()=>{setSelected(null);setLayout(null);setError("");}}>
          <Text style={styles.buttonText}>Sluiten</Text>
        </Pressable>

          </View>
        </View>
      </ScrollView>
    </Modal>
  </View>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:COLORS.background},
 deleteButton:{alignSelf:"flex-end",width:44,height:44,alignItems:"center",justifyContent:"center",borderRadius:RADIUS.md,backgroundColor:"#9B3440"},
 desktopModalContent:{width:"100%",maxWidth:1480,alignSelf:"center",paddingHorizontal:24},
 reviewColumns:{gap:18},
 reviewColumnsDesktop:{flexDirection:"row",alignItems:"flex-start",gap:28},
 editorColumn:{width:"100%"},
 editorColumnDesktop:{width:650,maxWidth:"53%",flexShrink:1},
 detailsColumn:{width:"100%",gap:12},
 detailsColumnDesktop:{flex:1,minWidth:0},
 conceptList:{gap:12},
 conceptListDesktop:{flexDirection:"row",flexWrap:"wrap",maxWidth:1200},
 conceptCardDesktop:{width:310},
 backButton:{flexDirection:"row",alignItems:"center",gap:10,alignSelf:"flex-start",paddingVertical:12,paddingHorizontal:14,backgroundColor:COLORS.surfaceLight,borderRadius:RADIUS.md},
 backText:{color:COLORS.text,fontWeight:"800"},
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
 cropRow:{flexDirection:"row",alignItems:"center",gap:8},
 cropButton:{flex:1,backgroundColor:COLORS.primary,borderRadius:RADIUS.md,padding:10,alignItems:"center"},
 overlayButtons:{flexDirection:"row",gap:10},
 smallButton:{flex:1,backgroundColor:COLORS.primary,borderRadius:RADIUS.md,padding:12,alignItems:"center"},
 thumb:{height:110,width:"100%"},
 original:{height:240,width:"100%"},
 button:{backgroundColor:COLORS.primary,borderRadius:RADIUS.md,padding:15,alignItems:"center"},
 buttonText:{color:COLORS.text,fontWeight:"800"},
});
