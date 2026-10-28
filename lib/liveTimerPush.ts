import { supabase } from "./supabase";

/** Alarm rows are private to their authenticated user via RLS. */
export async function scheduleLiveTimerPush(userId:string,trainingId:number,dueAt:number):Promise<string>{
    if(!supabase)throw new Error("Supabase is niet beschikbaar.");
    const {data,error}=await supabase.from("live_training_timer_alarms")
        .insert({user_id:userId,training_id:trainingId,due_at:new Date(dueAt).toISOString()})
        .select("id").single();
    if(error||!data)throw error||new Error("Alarm inplannen mislukt.");
    return data.id as string;
}

export async function cancelLiveTimerPush(alarmId:string):Promise<void>{
    if(!supabase)return;
    const {error}=await supabase.from("live_training_timer_alarms").delete().eq("id",alarmId);
    if(error)throw error;
}

export async function hasLiveTimerPushSubscription():Promise<boolean>{
    if(typeof navigator==="undefined"||!("serviceWorker" in navigator)||
       typeof Notification==="undefined"||Notification.permission!=="granted")return false;
    const registration=await navigator.serviceWorker.getRegistration("/hc-winsum-app/");
    return !!(await registration?.pushManager.getSubscription());
}
