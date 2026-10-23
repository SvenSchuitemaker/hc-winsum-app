import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
type Line = { id: string; type: "runLine" | "passLine"; x: number; y: number; x2: number; y2: number; lineStyle?: string };
const isLine = (item: Record<string, unknown>): item is Record<string, unknown> & Line =>
  typeof item.id === "string" && (item.type === "runLine" || item.type === "passLine") &&
  ["x","y","x2","y2"].every(key=>typeof item[key] === "number" && Number.isFinite(item[key]));

Deno.serve(async (request: Request) => {
  if(request.method === "OPTIONS")return new Response(null,{headers:cors});
  if(request.method !== "POST")return respond({error:"Methode niet toegestaan"},405);
  try {
    const auth=request.headers.get("Authorization")||"";
    const url=Deno.env.get("SUPABASE_URL");
    const anon=Deno.env.get("SUPABASE_ANON_KEY");
    const key=Deno.env.get("GEMINI_API_KEY");
    if(!auth.startsWith("Bearer ")||!url||!anon)return respond({error:"Niet geautoriseerd"},401);
    if(!key)return respond({error:"AI-sleutel ontbreekt"},503);
    const client=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:userData,error:userError}=await client.auth.getUser();
    if(userError||!userData.user)return respond({error:"Niet ingelogd"},401);
    const payload=await request.json().catch(()=>({}));
    const exerciseId=Number(payload.exerciseId);
    if(!Number.isSafeInteger(exerciseId)||exerciseId<1)return respond({error:"Ongeldige oefening"},400);
    const {data:exercise,error}=await client.from("exercises")
      .select("title,subtitle,explanation,instructions,board_layout").eq("id",exerciseId).single();
    if(error||!exercise)return respond({error:"Oefening niet gevonden"},404);
    const items=Array.isArray(exercise.board_layout?.items)?exercise.board_layout.items:[];
    const lines:Line[]=items.filter((item:Record<string,unknown>)=>item&&isLine(item));
    const players=items.filter((item:Record<string,unknown>)=>["player","attacker","defender"].includes(String(item?.type)))
      .map((item:Record<string,unknown>)=>({id:item.id,x:item.x,y:item.y,label:item.label}));
    if(!lines.length)return respond({order:[],carryingRunIds:[]});
    const prompt=`Je bent een Nederlandse hockeytrainer. Bepaal de JUISTE chronologische animatie van de volgende oefening.
Lees de titel, uitleg en instructies aandachtig. Gebruik de tekst voor wie de bal krijgt, wie loopt en wie uiteindelijk op doel schiet. De pijlen hebben mogelijk een andere invoervolgorde dan de daadwerkelijke oefening.
Een passLine beweegt de bal, een runLine beweegt een speler. Een speler die de bal heeft en dribbelt moet tegelijkertijd met de bal bewegen. Een speler zonder bal mag vóór de ontvangende pass inlopen. Zet het SCHOT op doel als laatste, na het aannemen en dribbelen van de speler die volgens de uitleg afrondt.
Geef JSON met twee velden: "order" (iedere lijn-id precies eenmaal, in afspeelvolgorde), "carryingRunIds" (alleen ids van runLines waarbij de loper zelf de bal drijft). Gebruik geen nieuwe ids. Verzin geen nieuwe pijlen. Zorg voor aannemelijke balbezitovergangen en volgorde; de schutter moet de bedoelde speler zijn.

Oefening:
${JSON.stringify({title:exercise.title,subtitle:exercise.subtitle,explanation:exercise.explanation,instructions:exercise.instructions,players,lines,fieldOrientation:exercise.board_layout?.fieldOrientation})}`;
    const model=Deno.env.get("GEMINI_EXERCISE_VISION_MODEL")||"gemini-3.8-flash";
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
      body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:0.1}}),
    });
    if(!response.ok)return respond({error:"AI-analyse tijdelijk niet beschikbaar"},502);
    const result=await response.json();
    const raw=(result.candidates?.[0]?.content?.parts||[]).map((part:{text?:string})=>part.text||"").join("");
    const plan=JSON.parse(raw);
    const ids=lines.map(line=>line.id);
    if(!Array.isArray(plan.order)||plan.order.length!==ids.length||new Set(plan.order).size!==ids.length||
      !plan.order.every((id:unknown)=>typeof id==="string"&&ids.includes(id)))return respond({error:"Onvolledige AI-volgorde"},502);
    const runs=new Set(lines.filter(line=>line.type==="runLine").map(line=>line.id));
    const carryingRunIds=Array.isArray(plan.carryingRunIds)
      ?plan.carryingRunIds.filter((id:unknown)=>typeof id==="string"&&runs.has(id)):[];
    return respond({order:plan.order,carryingRunIds});
  }catch{return respond({error:"Animatieplanning mislukt"},500);}
});
