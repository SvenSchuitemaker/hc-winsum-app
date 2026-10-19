// AI text-only recognition for original-photo import. No board is generated.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
async function geminiFetch(_url: string, init: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init.body || "{}"));
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return new Response(JSON.stringify({error:{code:"missing_api_key"}}),{status:503});
  const parts: Array<Record<string, unknown>> = [];
  const instructions: string[] = [];
  for (const msg of body.messages ?? []) {
    if (msg.role === "system") { instructions.push(String(msg.content)); continue; }
    if (typeof msg.content === "string") { parts.push({text:msg.content}); continue; }
    for (const p of msg.content ?? []) {
      if (p.type === "text") parts.push({text:p.text});
      if (p.type === "image_url") {
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(p.image_url?.url || ""));
        if (match) parts.push({inlineData:{mimeType:match[1],data:match[2]}});
      }
    }
  }
  const model=Deno.env.get("GEMINI_EXERCISE_VISION_MODEL") || "gemini-3.8-flash";
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
    method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
    body:JSON.stringify({
      systemInstruction:{parts:[{text:instructions.join("\n\n")}]},
      contents:[{role:"user",parts}],
      generationConfig:{responseMimeType:"application/json",temperature:0.1}
    })
  });
  if (!response.ok) return response;
  const result=await response.json();
  const content=(result.candidates?.[0]?.content?.parts ?? []).map((p:{text?:string})=>p.text || "").join("");
  if (!content) return new Response(JSON.stringify({error:{code:"empty_response"}}),{status:502});
  return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{"Content-Type":"application/json"}});
}

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type" },
});
const ageGroups = new Set(["JO8","JO10","JO12","JO14","JO16","JO18","MO8","MO10","MO12","MO14","MO16","MO18","Senioren"]);
const levels = new Set(["Makkelijk","Gemiddeld","Moeilijk"]);
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0,max) : "";
// A numbered generic label is a source reference, not a useful trainer-facing title.
const genericTitle = (value: string) =>
  /^(?:(?:vereenvoudigde?|basis|standaard|algemene?)\s+)?(?:pass?oefening|passenoefening|hockeyoefening|trainingsoefening|oefening|training|spelvorm|dribbeloefening)(?:\s*(?:(?:nummer|nr\.?|#)\s*)?\d+)?$/i.test(value.trim());

Deno.serve(async request => {
  if (request.method === "OPTIONS") return response({});
  if (request.method !== "POST") return response({error:"Only POST is supported"},405);
  const key = Deno.env.get("GEMINI_API_KEY");
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
    const ai = await geminiFetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({model:"gpt-4.1-mini",temperature:0,response_format:{type:"json_object"},
        messages:[
          {role:"system",content:`Lees de hockeyoefening rechtstreeks van de foto. Lever JSON met exact deze velden: title,subtitle,explanation,instructions,simplify,build_up,difficulty,audience,category_slug. Gebruik uitsluitend aantoonbare tekst of nauwkeurig afgeleide aanwijzingen, nooit een verzonnen oefening. Maak een SPECIFIEKE, betekenisvolle Nederlandse titel van circa 4-9 woorden die deze oefening herkenbaar onderscheidt van andere oefeningen. Benoem waar zichtbaar de technische actie (bijvoorbeeld passen, aannemen, vrijlopen, afronden), het patroon of de spelvorm (bijvoorbeeld driehoek, kom, 3-tegen-2, doorschuiven) en eventueel het trainingsdoel. Gebruik alleen kenmerken die werkelijk uit de foto of begeleidende tekst blijken. Een bij de afbeelding gedrukte titel als "Vereenvoudigde passoefening 9" is een bronlabel en mag NIET letterlijk als titel worden overgenomen. Vermijd generieke titels zoals "Passoefening", "Hockeyoefening 3", "Training 9" of "Vereenvoudigde passoefening 9"; vermijd losstaande volg- of oefeningnummers en marketingtaal. Verzamel eerst de concrete kenmerken en schrijf daarna één korte, natuurlijke titel; verzin nooit een opstelling als deze niet zichtbaar is. Gebruik een bestaande category_slug uit ${JSON.stringify(categoryList)}. difficulty: Makkelijk/Gemiddeld/Moeilijk. audience: kies alleen toepasselijke codes uit JO8,JO10,JO12,JO14,JO16,JO18,MO8,MO10,MO12,MO14,MO16,MO18,Senioren. Voeg JO en MO voor dezelfde leeftijd toe bij gelijke geschiktheid. VUL ELK TEKSTVELD inhoudelijk in (geen lege strings): subtitle = een korte samenvatting met belangrijkste doel/vaardigheid; explanation = doel, opstelling en verloop in begrijpelijk Nederlands; instructions = genummerde, uitvoerbare stappen voor de trainer; simplify = één concrete, veilig uitvoerbare vereenvoudiging van dezelfde oefening; build_up = één concrete, uitdagendere uitbreiding van dezelfde oefening. Voor simplify en build_up mag je traineradvies voorstellen op basis van de herkende basisvorm, maar verzin geen feiten over de foto. De voorstellen moeten passen bij de waargenomen oefening en realistisch uitvoerbaar zijn. Gebruik bij onduidelijke details neutrale formuleringen en geen bedachte aantallen spelers, materialen of afstanden. Kies een passende difficulty en minstens één audience, zolang de leeftijdsgeschiktheid redelijk uit de oefening kan worden afgeleid. category_slug moet altijd één van de bestaande categorieën zijn. Gebruik Nederlands, concrete hockeytermen en geen lege standaardtekst. Geen tekeninstructies of afbeeldingsdata produceren.`},
          {role:"user",content:[{type:"text",text:"Lees alle relevante tekst van deze hockeyoefening en classificeer."},
            {type:"image_url",image_url:{url:`data:${mime};base64,${base64}`,detail:"high"}}]},
        ]}),
    });
    if(!ai.ok) return response({error:"AI kon de foto niet verwerken."},502);
    const result = await ai.json();
    const raw = result?.choices?.[0]?.message?.content;
    if(typeof raw !== "string") return response({error:"AI gaf geen tekst terug."},502);
    const parsed = JSON.parse(raw);
    let title=text(parsed.title,160);
    const slug=text(parsed.category_slug,120);
    if(!title || !categoryList.some(c=>c.slug===slug)) return response({error:"Titel of categorie kon niet betrouwbaar worden bepaald."},422);
    if (genericTitle(title)) {
      // Retry a title only, grounded in the original photo analysis. Don't change description fields.
      const revised = await geminiFetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4.1-mini", temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Je schrijft uitsluitend één herkenbare, concrete titel voor een hockeyoefening als JSON {title:string}. Gebruik 4 tot 9 Nederlandse woorden. Noem de werkelijke technische actie en zichtbare oefenvorm. Kopieer geen generieke bronlabels, volg- of oefeningnummers. Verzin geen details. Gebruik alleen de gegeven beschrijving." },
            { role: "user", content: JSON.stringify({
              generic_title: title,
              explanation: text(parsed.explanation,1800),
              instructions: text(parsed.instructions,1800),
              subtitle: text(parsed.subtitle,250),
            }) },
          ],
        }),
      });
      if (revised.ok) {
        const result = await revised.json();
        try {
          const value = JSON.parse(result?.choices?.[0]?.message?.content ?? "{}");
          const candidate = text(value.title,160);
          if (candidate && !genericTitle(candidate)) title = candidate;
        } catch { /* Keep the initial result for the final quality check. */ }
      }
      if (genericTitle(title)) {
        return response({error:"AI kon geen onderscheidende titel bepalen. Voeg meer informatie toe aan de foto en probeer opnieuw."},422);
      }
    }
    // Fill any omitted text fields in a second, lightweight pass using only the
    // recognised exercise. Variations are suggestions, not claims about the photo.
    const requiredText = ["subtitle","explanation","instructions","simplify","build_up"] as const;
    const missing = requiredText.filter(field => !text(parsed[field],4000));
    if (missing.length) {
      try {
        const completion = await geminiFetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4.1-mini", temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "Je bent een ervaren Nederlandse hockeytrainer. Vul ALLEEN de ontbrekende velden in en antwoord JSON. subtitle = kort doel; explanation = doel en verloop; instructions = concrete genummerde stappen; simplify = voorstel voor eenvoudiger variant; build_up = voorstel voor moeilijker variant. Gebruik uitsluitend de aangeleverde feiten. Voor beide varianten mag je haalbare trainersuggesties maken, geen feiten over de bronfoto verzinnen. Geen lege strings, geen willekeurige aantallen of afstanden." },
              { role: "user", content: JSON.stringify({
                missing, title, category_slug: slug,
                recognised: Object.fromEntries(requiredText.map(field => [field,text(parsed[field],3000)])),
              }) },
            ],
          }),
        });
        if (completion.ok) {
          const data = await completion.json();
          const values = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
          for (const field of missing) {
            const candidate = text(values[field],4000);
            if (candidate) parsed[field] = candidate;
          }
        }
      } catch {
        // Return recognised content if the optional completion is unavailable.
      }
    }
    const missing_fields = requiredText.filter(field => !text(parsed[field],4000));
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
      missing_fields,
    });
  } catch { return response({error:"AI-tekstherkenning mislukt."},500); }
});
