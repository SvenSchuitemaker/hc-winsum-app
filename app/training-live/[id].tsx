import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import ExerciseAnimation from "../../components/ExerciseAnimation";
import type { ExerciseBoardLayout } from "../../components/exercise-board/boardTypes";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { getTrainerExercisePreviewUrl } from "../../lib/trainerExercisePreview";
import { supabase } from "../../lib/supabase";

type ExerciseInfo = { title:string;image_url:string|null;board_layout?:ExerciseBoardLayout|null;preview_image_path?:string|null };
type SessionBlock = { id:number;title:string;duration:number;notes:string|null;is_break:boolean;exercise:ExerciseInfo|null };
function relation<T>(input:T|T[]|null):T|null {return Array.isArray(input)?input[0]||null:input;}
function clock(total:number) {const sec=Math.max(0,total);return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;}

export default function LiveTrainingScreen() {
    const {id}=useLocalSearchParams<{id:string}>();
    const [trainingTitle,setTrainingTitle]=useState("");
    const [blocks,setBlocks]=useState<SessionBlock[]>([]);
    const [step,setStep]=useState(0);
    const [seconds,setSeconds]=useState(0);
    const [running,setRunning]=useState(false);
    const [loading,setLoading]=useState(true);
    const [error,setError]=useState("");
    useEffect(()=>{let active=true;async function load(){
        if(!supabase||!id)return;
        try {
            const [{data:training,error:trainError},{data:rows,error:blocksError}]=await Promise.all([
                supabase.from("trainings").select("title").eq("id",Number(id)).single(),
                supabase.from("training_blocks").select("id,position,title,duration,notes,is_break,exercises:exercises(title,image_url,board_layout),concept:exercise_concepts(title,preview_image_path,board_layout)").eq("training_id",Number(id)).order("position")
            ]);
            if(trainError||blocksError)throw trainError||blocksError;
            const prepared=await Promise.all((rows||[]).map(async(row:any)=>{
                const concept=relation<ExerciseInfo>(row.concept);
                const normal=relation<ExerciseInfo>(row.exercises);
                const image_url=concept?await getTrainerExercisePreviewUrl(concept.preview_image_path):normal?.image_url||null;
                return {id:row.id,title:row.title,duration:row.duration||0,notes:row.notes,is_break:!!row.is_break,
                    exercise:concept?{...concept,image_url}:normal} as SessionBlock;
            }));
            if(!active)return;
            setBlocks(prepared);setTrainingTitle(training.title);setSeconds(Math.max(0,Math.round((prepared[0]?.duration||0)*60)));
        }catch(reason){if(active)setError(reason instanceof Error?reason.message:"Trainingsmodus kon niet worden geladen.");}
        finally{if(active)setLoading(false);}
    }void load();return()=>{active=false;};},[id]);
    const select=useCallback((next:number)=>{
        if(next<0||next>=blocks.length){setRunning(false);return;}
        setStep(next);setSeconds(Math.max(0,Math.round(blocks[next].duration*60)));setRunning(false);
    },[blocks]);
    useEffect(()=>{if(!running)return;const interval=setInterval(()=>setSeconds(value=>Math.max(0,value-1)),1000);return()=>clearInterval(interval);},[running]);
    useEffect(()=>{if(seconds===0&&running){setRunning(false);if(step+1<blocks.length)select(step+1);}},[seconds,running,step,blocks.length,select]);
    const current=blocks[step];
    const total=useMemo(()=>blocks.reduce((sum,row)=>sum+row.duration,0),[blocks]);
    if(loading)return <View style={styles.center}><ActivityIndicator color={COLORS.primaryLight}/></View>;
    if(error||!current)return <View style={styles.center}><Text style={styles.text}>{error||"Geen onderdelen gevonden."}</Text><Pressable onPress={()=>router.back()}><Text style={styles.link}>Terug</Text></Pressable></View>;
    return <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Pressable onPress={()=>router.back()} style={styles.back}><Ionicons name="arrow-back" color="#fff" size={22}/><Text style={styles.text}>Training afsluiten</Text></Pressable>
        <Text style={styles.subtitle}>{trainingTitle} · {total} minuten</Text>
        <Text style={styles.progress}>Onderdeel {step+1} van {blocks.length}{current.is_break?" · PAUZE":""}</Text>
        <Text style={styles.title}>{current.title}</Text>
        <View style={[styles.clockBox,current.is_break&&styles.breakBox]}>
            <Text style={styles.clock}>{clock(seconds)}</Text>
            <Text style={styles.subtitle}>{current.is_break?"Zet de volgende oefening klaar":"Resterende tijd"}</Text>
            <View style={styles.actions}>
                <Pressable style={styles.button} onPress={()=>setRunning(value=>!value)}><Text style={styles.buttonText}>{running?"⏸ Pauzeer timer":"▶ Start timer"}</Text></Pressable>
                <Pressable style={styles.secondary} onPress={()=>setSeconds(value=>value+60)}><Text style={styles.buttonText}>+ 1 minuut</Text></Pressable>
                <Pressable style={styles.secondary} onPress={()=>setSeconds(Math.max(0,Math.round(current.duration*60)))}><Text style={styles.buttonText}>↺ Reset</Text></Pressable>
            </View>
        </View>
        {!!current.notes&&<Text style={styles.notes}>{current.notes}</Text>}
        {!current.is_break&&!!current.exercise&&<>
            <Text style={styles.exerciseTitle}>{current.exercise.title}</Text>
            {!!current.exercise.image_url&&(current.exercise.board_layout?.items?.length
                ? <ExerciseAnimation layout={current.exercise.board_layout} imageUrl={current.exercise.image_url}/>
                : <Image source={{uri:current.exercise.image_url}} style={styles.image} resizeMode="contain"/>)}
        </>}
        <View style={styles.actions}>
            <Pressable style={styles.secondary} disabled={step===0} onPress={()=>select(step-1)}><Text style={styles.buttonText}>← Vorige</Text></Pressable>
            <Pressable style={styles.button} onPress={()=>step+1<blocks.length?select(step+1):router.back()}><Text style={styles.buttonText}>{step+1<blocks.length?"Volgende →":"Afronden"}</Text></Pressable>
        </View>
        {step+1<blocks.length&&<Text style={styles.next}>Hierna: {blocks[step+1].title} ({blocks[step+1].duration} min)</Text>}
    </ScrollView>;
}
const styles=StyleSheet.create({
    root:{flex:1,backgroundColor:COLORS.background},content:{padding:SPACING.md,paddingBottom:48,maxWidth:850,width:"100%",alignSelf:"center",gap:12},
    center:{flex:1,justifyContent:"center",alignItems:"center",backgroundColor:COLORS.background,padding:20},
    back:{flexDirection:"row",alignItems:"center",gap:12,marginBottom:8},text:{color:COLORS.text,fontWeight:"800"},
    subtitle:{color:COLORS.mutedText,fontSize:15},progress:{color:COLORS.primaryLight,fontWeight:"800"},title:{color:"#fff",fontWeight:"900",fontSize:28},
    clockBox:{backgroundColor:COLORS.surface,borderRadius:RADIUS.lg,padding:25,alignItems:"center",gap:10},
    breakBox:{borderColor:"#E9A23B",borderWidth:2},clock:{fontSize:65,color:"#fff",fontWeight:"900",fontVariant:["tabular-nums"]},
    actions:{flexDirection:"row",flexWrap:"wrap",justifyContent:"center",gap:10,marginTop:12},
    button:{backgroundColor:COLORS.primary,paddingVertical:13,paddingHorizontal:18,borderRadius:12},
    secondary:{backgroundColor:COLORS.surfaceLight,paddingVertical:13,paddingHorizontal:18,borderRadius:12},
    buttonText:{color:"#fff",fontWeight:"800"},notes:{color:COLORS.text,fontSize:16,lineHeight:23},
    exerciseTitle:{color:"#fff",fontSize:19,fontWeight:"800"},image:{width:"100%",height:290},
    next:{color:COLORS.primaryLight,fontWeight:"700",textAlign:"center"},link:{color:COLORS.primaryLight}
});
