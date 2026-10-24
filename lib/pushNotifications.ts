import { Platform } from "react-native";
import { supabase } from "./supabase";

function decodeVapidKey(key:string):Uint8Array {
    const padded=key.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(key.length/4)*4,"=");
    const raw=window.atob(padded);
    return Uint8Array.from(raw, char=>char.charCodeAt(0));
}
export function canUseWebPush(){
    return Platform.OS==="web" && typeof window!=="undefined" &&
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export async function enableTrainingPushNotifications(userId:string):Promise<string>{
    if(!canUseWebPush())return "Pushmeldingen worden op dit apparaat niet ondersteund. Meldingen in de app blijven beschikbaar.";
    const permission=await Notification.requestPermission();
    if(permission!=="granted")return "Meldingen zijn niet toegestaan. Sta meldingen toe in je browserinstellingen.";
    if(!supabase)throw new Error("Geen verbinding met Supabase.");
    const {data,error}=await supabase.functions.invoke("dispatch-push",{method:"GET"});
    if(error||!data?.publicKey)throw new Error("Pushnotificaties konden niet worden geactiveerd.");
    const base="/hc-winsum-app/";
    const worker=await navigator.serviceWorker.register(base+"push-sw.js",{scope:base});
    const ready=await navigator.serviceWorker.ready;
    const subscription=await ready.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:decodeVapidKey(data.publicKey) as BufferSource,
    });
    const keys=subscription.toJSON().keys;
    if(!subscription.endpoint||!keys?.p256dh||!keys?.auth)throw new Error("Geen geldige pushregistratie.");
    const {error:saveError}=await supabase.from("app_push_subscriptions").upsert({
        user_id:userId,endpoint:subscription.endpoint,p256dh:keys.p256dh,auth_secret:keys.auth,
    },{onConflict:"endpoint"});
    if(saveError)throw saveError;
    return "Pushnotificaties zijn ingeschakeld op dit apparaat.";
}
