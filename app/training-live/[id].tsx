import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from "react-native";
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
    const [alarmActive,setAlarmActive]=useState(false);
    const audioContext=useRef<any>(null);
    const alarmInterval=useRef<ReturnType<typeof setInterval>|null>(null);
    // A fixed end timestamp keeps elapsed time accurate while the app/browser is suspended.
    const endTime=useRef<number|null>(null);
    const refreshTime=useCallback(()=>{
        if(endTime.current===null)return;
        const remaining=Math.max(0,Math.ceil((endTime.current-Date.now())/1000));
        setSeconds(remaining);
        if(remaining===0){
            endTime.current=null;
            setRunning(false);
            setAlarmActive(true);
        }
    },[]);
    const addMinute=useCallback(()=>{
        if(endTime.current!==null){
            endTime.current+=60000;
            refreshTime();
        }else setSeconds(value=>value+60);
    },[refreshTime]);
    const resetTimer=useCallback((duration:number)=>{
        endTime.current=null;
        setRunning(false);
        setSeconds(Math.max(0,Math.round(duration*60)));
    },[]);
    const unlockAudio=useCallback(()=>{
        if(Platform.OS!=="web"||typeof window==="undefined")return;
        try {
            const AudioContextClass=(window as any).AudioContext||(window as any).webkitAudioContext;
            if(!AudioContextClass)return;
            if(!audioContext.current)audioContext.current=new AudioContextClass();
            void audioContext.current.resume();
        }catch{/* Browser may block sound. */}
    },[]);
    const toggleTimer=useCallback(()=>{
        unlockAudio();
        if(endTime.current!==null){
            const remaining=Math.max(0,Math.ceil((endTime.current-Date.now())/1000));
            endTime.current=null;
            setSeconds(remaining);
            setRunning(false);
            if(remaining===0)setAlarmActive(true);
        }else{
            endTime.current=Date.now()+seconds*1000;
            setRunning(true);
            refreshTime();
        }
    },[seconds,unlockAudio,refreshTime]);
    const beep=useCallback(()=>{
        const context=audioContext.current;
        if(!context||context.state!=="running")return;
        try {
            const oscillator=context.createOscillator();
            const gain=context.createGain();
            oscillator.type="square";oscillator.frequency.value=880;
            gain.gain.setValueAtTime(0.0001,context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.16,context.currentTime+0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001,context.currentTime+0.32);
            oscillator.connect(gain);gain.connect(context.destination);
            oscillator.start();oscillator.stop(context.currentTime+0.33);
        }catch{/* Keep visual alarm active. */}
    },[]);
    useEffect(()=>{
        if(!alarmActive)return;
        if(Platform.OS==="web"){
            void audioContext.current?.resume?.();
            beep();alarmInterval.current=setInterval(beep,750);
        }else Vibration.vibrate([0,500,300,500],true);
        return()=>{
            if(alarmInterval.current){clearInterval(alarmInterval.current);alarmInterval.current=null;}
            Vibration.cancel();
        };
    },[alarmActive,beep]);
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
        if(next<0||next>=blocks.length){endTime.current=null;setRunning(false);return;}
        endTime.current=null;
        setAlarmActive(false);setStep(next);setSeconds(Math.max(0,Math.round(blocks[next].duration*60)));setRunning(false);
    },[blocks]);
    useEffect(()=>{
        if(!running)return;
        refreshTime();
        const interval=setInterval(refreshTime,500);
        return()=>clearInterval(interval);
    },[running,refreshTime]);
    useEffect(()=>{
        const subscription=AppState.addEventListener("change",state=>{
            if(state==="active")refreshTime();
        });
        if(Platform.OS!=="web")return()=>subscription.remove();
        const onVisible=()=>{if(document.visibilityState==="visible")refreshTime();};
        document.addEventListener("visibilitychange",onVisible);
        window.addEventListener("focus",refreshTime);
        return()=>{
            subscription.remove();
            document.removeEventListener("visibilitychange",onVisible);
            window.removeEventListener("focus",refreshTime);
        };
    },[refreshTime]);
    const dismissAlarm=useCallback(()=>{
        setAlarmActive(false);
        if(step+1<blocks.length)select(step+1);
    },[step,blocks.length,select]);
    const current=blocks[step];
    const total=useMemo(()=>blocks.reduce((sum,row)=>sum+row.duration,0),[blocks]);
    if(loading)return <View style={styles.center}><ActivityIndicator color={COLORS.primaryLight}/></View>;
    if(error||!current)return <View style={styles.center}><Text style={styles.text}>{error||"Geen onderdelen gevonden."}</Text><Pressable onPress={()=>router.back()}><Text style={styles.link}>Terug</Text></Pressable></View>;
    return <><ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Pressable onPress={()=>router.back()} style={styles.back}><Ionicons name="arrow-back" color="#fff" size={22}/><Text style={styles.text}>Training afsluiten</Text></Pressable>
        <Text style={styles.subtitle}>{trainingTitle} · {total} minuten</Text>
        <Text style={styles.progress}>Onderdeel {step+1} van {blocks.length}{current.is_break?" · PAUZE":""}</Text>
        <Text style={styles.title}>{current.title}</Text>
        <View style={[styles.clockBox,current.is_break&&styles.breakBox]}>
            <Text style={styles.clock}>{clock(seconds)}</Text>
            <Text style={styles.subtitle}>{current.is_break?"Zet de volgende oefening klaar":"Resterende tijd"}</Text>
            <View style={styles.actions}>
                <Pressable style={styles.button} onPress={toggleTimer}><Text style={styles.buttonText}>{running?"⏸ Pauzeer timer":"▶ Start timer"}</Text></Pressable>
                <Pressable style={styles.secondary} onPress={addMinute}><Text style={styles.buttonText}>+ 1 minuut</Text></Pressable>
                <Pressable style={styles.secondary} onPress={()=>resetTimer(current.duration)}><Text style={styles.buttonText}>↺ Reset</Text></Pressable>
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
    </ScrollView>
        <Modal visible={alarmActive} transparent animationType="fade" onRequestClose={()=>{}}>
            <View style={styles.alarmOverlay}>
                <View style={styles.alarmCard}>
                    <Ionicons name="alarm" size={54} color="#FFCF65"/>
                    <Text style={styles.alarmTitle}>Tijd is om!</Text>
                    <Text style={styles.alarmDescription}>Het onderdeel is afgelopen. Zet het alarm uit om {step+1<blocks.length?"naar de volgende oefening te gaan.":"de training af te ronden."}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Alarm uitzetten" style={styles.alarmButton} onPress={dismissAlarm}>
                        <Ionicons name="notifications-off" size={22} color="#fff"/>
                        <Text style={styles.buttonText}>Alarm uitzetten</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    </>;
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
    next:{color:COLORS.primaryLight,fontWeight:"700",textAlign:"center"},link:{color:COLORS.primaryLight},
    alarmOverlay:{flex:1,backgroundColor:"rgba(0,0,0,0.85)",justifyContent:"center",alignItems:"center",padding:24},
    alarmCard:{backgroundColor:COLORS.surface,borderRadius:RADIUS.lg,padding:28,width:"100%",maxWidth:440,alignItems:"center",gap:18,borderWidth:2,borderColor:"#FFCF65"},
    alarmTitle:{fontSize:30,fontWeight:"900",color:"#fff",textAlign:"center"},
    alarmDescription:{fontSize:17,lineHeight:25,color:COLORS.text,textAlign:"center"},
    alarmButton:{backgroundColor:COLORS.primary,paddingVertical:17,paddingHorizontal:25,borderRadius:12,flexDirection:"row",alignItems:"center",gap:12,marginTop:8}
});
