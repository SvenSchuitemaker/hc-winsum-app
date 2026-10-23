import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-dispatcher-secret",
 "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const url=Deno.env.get("SUPABASE_URL")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
const admin=createClient(url,serviceKey);
type Config={dispatcher_secret:string;vapid_public:string|null;vapid_private:string|null};
async function getConfig():Promise<Config>{
 const {data,error}=await admin.from("app_push_server_config")
   .select("dispatcher_secret,vapid_public,vapid_private").eq("id",1).single();
 if(error||!data)throw new Error("Pushconfiguratie ontbreekt");
 if(data.vapid_public&&data.vapid_private)return data as Config;
 const keys=webpush.generateVAPIDKeys();
 const {data:updated,error:saveError}=await admin.from("app_push_server_config")
   .update({vapid_public:keys.publicKey,vapid_private:keys.privateKey})
   .eq("id",1).select("dispatcher_secret,vapid_public,vapid_private").single();
 if(saveError||!updated)throw new Error("Pushsleutel opslaan mislukt");
 return updated as Config;
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 try{
   if(req.method==="GET"){
     const auth=req.headers.get("Authorization")||"";
     if(!auth.startsWith("Bearer "))return json({error:"Inloggen vereist"},401);
     const userClient=createClient(url,anonKey,{global:{headers:{Authorization:auth}}});
     const {data,error}=await userClient.auth.getUser();
     if(error||!data.user)return json({error:"Geen geldige sessie"},401);
     const config=await getConfig();
     return json({publicKey:config.vapid_public});
   }
   if(req.method!=="POST")return json({error:"Methode niet toegestaan"},405);
   const config=await getConfig();
   if(!req.headers.get("X-Dispatcher-Secret")||req.headers.get("X-Dispatcher-Secret")!==config.dispatcher_secret)
      return json({error:"Geen toegang"},401);
   webpush.setVapidDetails("https://svenschuitemaker.github.io/hc-winsum-app/",config.vapid_public!,config.vapid_private!);
   const {data:notifications,error:loadError}=await admin.from("app_notifications")
      .select("id,user_id,title,body,target_path").is("push_sent_at",null)
      .order("created_at",{ascending:true}).limit(100);
   if(loadError)throw loadError;
   let delivered=0;
   for(const n of notifications||[]){
     const {data:devices}=await admin.from("app_push_subscriptions")
       .select("id,endpoint,p256dh,auth_secret").eq("user_id",n.user_id);
     for(const device of devices||[]){
       try{
         await webpush.sendNotification({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth_secret}},
           JSON.stringify({title:n.title,body:n.body,path:n.target_path}),{TTL:86400});
         delivered++;
       }catch(error){
         const status=(error as {statusCode?:number}).statusCode;
         if(status===404||status===410)await admin.from("app_push_subscriptions").delete().eq("id",device.id);
         else console.error("Pushbezorging mislukt",status||"onbekend");
       }
     }
     await admin.from("app_notifications").update({push_sent_at:new Date().toISOString()}).eq("id",n.id);
   }
   return json({processed:notifications?.length||0,delivered});
 }catch(e){console.error("Pushfout",e instanceof Error?e.message:"unknown");return json({error:"Pushverwerking mislukt"},500);}
});
