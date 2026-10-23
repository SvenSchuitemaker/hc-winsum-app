import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { canUseWebPush, enableTrainingPushNotifications } from "../lib/pushNotifications";

type NotificationRow={
 id:string; title:string; body:string; target_path:string; kind:string; created_at:string; read_at:string|null;
};
export default function NotificationsScreen(){
 const {user}=useAuth();
 const [items,setItems]=useState<NotificationRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [enabling,setEnabling]=useState(false);
 const [message,setMessage]=useState("");
 const load=useCallback(async()=>{
   if(!supabase||!user){setItems([]);setLoading(false);return;}
   setLoading(true);
   const {data,error}=await supabase.from("app_notifications")
     .select("id,title,body,target_path,kind,created_at,read_at")
     .eq("user_id",user.id).order("created_at",{ascending:false}).limit(100);
   if(error)setMessage(error.message);
   else setItems(data||[]);
   setLoading(false);
 },[user]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 async function open(item:NotificationRow){
   if(supabase&&!item.read_at)await supabase.from("app_notifications")
     .update({read_at:new Date().toISOString()}).eq("id",item.id).eq("user_id",user?.id);
   setItems(before=>before.map(row=>row.id===item.id?{...row,read_at:new Date().toISOString()}:row));
   router.push(item.target_path as any);
 }
 async function enablePush(){
   if(!user)return;
   setEnabling(true);setMessage("");
   try{setMessage(await enableTrainingPushNotifications(user.id));}
   catch(error){setMessage(error instanceof Error?error.message:"Pushmeldingen inschakelen mislukt.");}
   finally{setEnabling(false);}
 }
 return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
   <View style={styles.card}>
      <Text style={styles.heading}>Meldingen</Text>
      <Text style={styles.description}>Herinneringen voor trainingen, evaluaties en nieuwe conceptoefeningen.</Text>
      <Pressable style={[styles.button,enabling&&styles.disabled]} onPress={enablePush} disabled={enabling}>
        {enabling?<ActivityIndicator color="#fff"/>:
          <Text style={styles.buttonText}>{canUseWebPush()?"🔔 Pushmeldingen inschakelen":"Pushmeldingen niet ondersteund"}</Text>}
      </Pressable>
      {!!message&&<Text style={styles.message}>{message}</Text>}
      <Text style={styles.hint}>Sta meldingen toe in je browser. Op Android werkt dit ook als de geïnstalleerde PWA gesloten is.</Text>
   </View>
   <Text style={styles.section}>Ontvangen meldingen</Text>
   {loading?<ActivityIndicator color={COLORS.primary}/>:items.length===0?
      <Text style={styles.empty}>Je hebt nog geen meldingen.</Text>:
      items.map(item=><Pressable key={item.id} style={[styles.item,!item.read_at&&styles.unread]} onPress={()=>void open(item)}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          {!item.read_at&&<View style={styles.dot}/>}
        </View>
        <Text style={styles.body}>{item.body}</Text>
        <Text style={styles.date}>{new Date(item.created_at).toLocaleString("nl-NL")}</Text>
      </Pressable>)}
 </ScrollView>;
}
const styles=StyleSheet.create({
 page:{flex:1,backgroundColor:COLORS.background},
 content:{padding:SPACING.md,paddingBottom:60},
 card:{padding:18,backgroundColor:COLORS.surface,borderRadius:RADIUS.lg,marginBottom:18,borderColor:COLORS.border,borderWidth:1},
 heading:{color:COLORS.text,fontSize:26,fontWeight:"900",marginBottom:8},
 description:{color:COLORS.mutedText,fontSize:15,marginBottom:14},
 button:{backgroundColor:COLORS.primary,padding:14,borderRadius:12,alignItems:"center"},
 buttonText:{color:"#fff",fontWeight:"800",fontSize:15},
 disabled:{opacity:.5},
 message:{color:COLORS.primaryLight,marginTop:12,lineHeight:20},
 hint:{color:COLORS.mutedText,fontSize:12,marginTop:12,lineHeight:18},
 section:{color:COLORS.text,fontWeight:"800",fontSize:18,marginBottom:12},
 empty:{color:COLORS.mutedText,marginTop:10},
 item:{padding:16,borderRadius:12,backgroundColor:COLORS.surface,marginBottom:10,borderColor:COLORS.border,borderWidth:1},
 unread:{borderColor:COLORS.primaryLight,backgroundColor:COLORS.surfaceLight},
 itemHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8},
 itemTitle:{color:COLORS.text,fontSize:16,fontWeight:"900",flex:1},
 dot:{width:9,height:9,borderRadius:5,backgroundColor:COLORS.primaryLight},
 body:{color:COLORS.mutedText,marginTop:7,lineHeight:20},
 date:{color:COLORS.mutedText,fontSize:12,marginTop:8}
});
