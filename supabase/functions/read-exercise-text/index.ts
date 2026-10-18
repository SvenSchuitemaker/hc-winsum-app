// AI text-only recognition for original-photo import. No board is generated.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type" },
});
const ageGroups = new Set(["JO8","JO10","JO12","JO14","JO16","JO18","MO8","MO10","MO12","MO14","MO16","MO18","Senioren"]);
const levels = new Set(["Makkelijk","Gemiddeld","Moeilijk"]);
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0,max) : "";
Deno.serve(async request => {
  if (request.method === "OPTIONS") return response({});
  if (request.method !== "POST") return response({error:"Only POST is supported"},405);
  const key = Deno.env.get("OPENAI_API_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!key || !url || !anon) return response({error:"AI-import is niet geconfigureerd"},503);
  const jwt = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i,"");
  const supabase = createClient(url,anon,{global:{headers:{Authorization:`Bearer ${jwt}`}}});
  const {data:{user},error:authError} = await supabase.auth.getUser(jwt);
  if(authError || !user) return response({error:"Log eerst in."},401);
  const {data:profile} = await supabase.from("profiles").select("role").eq("id",user.id).single();
  if(profile?.role !== "super_admin") return response({error:"Alleen superadmins mogen importeren."},403);
  let body: Record<string,unknown>;
  try { body = await request.json(); } catch { return response({error:"Ongeldig verzoek"},400); }
  const mime = text(body.mimeType,40), base64 = text(body.base64,7_000_020);
  if (!["image/jpeg","image/png","image/webp"].includes(mime) ||
      base64.length < 20 || base64.length > 7_000_000 || !/^[A-Za-z0-9+/=]+$/.test(base64)) {
    return response({error:"Kies een JPG, PNG of WebP onder 5 MB."},400);
  }
  const {data:categories,error:categoryError} = await supabase.from("categories").select("slug,title");
  if(categoryError || !categories?.length) return response({error:"Geen categorieën beschikbaar."},500);
  const categoryList = categories.map(c=>({slug:String(c.slug),title:String(c.title)}));
  try {
    const ai = await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({model:"gpt-4.1-mini",temperature:0,response_format:{type:"json_object"},
        messages:[
          {role:"system",content:`Lees de hockeyoefening rechtstreeks van de foto. Lever JSON met exact deze velden: title,subtitle,explanation,instructions,simplify,build_up,difficulty,audience,category_slug. Gebruik uitsluitend aantoonbare tekst of nauwkeurig afgeleide aanwijzingen, nooit een verzonnen oefening. Gebruik een bestaande category_slug uit ${JSON.stringify(categoryList)}. difficulty: Makkelijk/Gemiddeld/Moeilijk. audience: kies alleen toepasselijke codes uit JO8,JO10,JO12,JO14,JO16,JO18,MO8,MO10,MO12,MO14,MO16,MO18,Senioren. Voeg JO en MO voor dezelfde leeftijd toe bij gelijke geschiktheid. Geef in instructions de organisatie en stappen uit de afbeelding, in explanation het doel en verloop. Geen tekeninstructies of afbeeldingsdata produceren.`},
          {role:"user",content:[{type:"text",text:"Lees alle relevante tekst van deze hockeyoefening en classificeer."},
            {type:"image_url",image_url:{url:`data:${mime};base64,${base64}`,detail:"high"}}]},
        ]}),
    });
    if(!ai.ok) return response({error:"AI kon de foto niet verwerken."},502);
    const result = await ai.json();
    const raw = result?.choices?.[0]?.message?.content;
    if(typeof raw !== "string") return response({error:"AI gaf geen tekst terug."},502);
    const parsed = JSON.parse(raw);
    const title=text(parsed.title,160);
    const slug=text(parsed.category_slug,120);
    if(!title || !categoryList.some(c=>c.slug===slug)) return response({error:"Titel of categorie kon niet betrouwbaar worden bepaald."},422);
    const audience = Array.isArray(parsed.audience)
      ? [...new Set(parsed.audience.filter((v:unknown)=>typeof v==="string" && ageGroups.has(v)))] : [];
    return response({
      title,category_slug:slug,
      subtitle:text(parsed.subtitle,300),
      explanation:text(parsed.explanation,4000),
      instructions:text(parsed.instructions,4000),
      simplify:text(parsed.simplify,4000),
      build_up:text(parsed.build_up,4000),
      difficulty:levels.has(parsed.difficulty)?parsed.difficulty:"Gemiddeld",
      audience,
    });
  } catch { return response({error:"AI-tekstherkenning mislukt."},500); }
});
