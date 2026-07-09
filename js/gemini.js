const Gemini = (() => {
  function parseJSON(text){
    const clean = String(text || "").replace(/```json/gi,"").replace(/```/g,"").trim();
    try { return JSON.parse(clean); }
    catch(e){
      const a = clean.indexOf("[");
      const b = clean.lastIndexOf("]");
      if(a >= 0 && b > a) return JSON.parse(clean.slice(a,b+1));
      throw e;
    }
  }

  async function analyze(apiKey, pages){
    const text = pages
      .filter(p => p.text && p.text.length > 40)
      .map(p => `--- PÁGINA ${p.page} ---\n${p.text}`)
      .join("\n\n")
      .slice(0, 65000);

    if(text.length < 120) throw new Error("El PDF no contiene texto suficiente.");

    const finalPrompt = `${ECO_PROMPT}

Responde estrictamente con un arreglo JSON válido.
No uses markdown.
No escribas texto antes ni después del JSON.

TEXTO DEL DOCUMENTO:
${text}`;

    const models = ["gemini-2.0-flash", "gemini-2.5-flash"];
    let lastError = "";

    for(const model of models){
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          contents:[{ parts:[{ text: finalPrompt }] }],
          generationConfig:{ temperature:0.05, responseMimeType:"application/json" }
        })
      });

      if(res.ok){
        const data = await res.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return parseJSON(raw);
      }

      lastError = await res.text();
      console.error("Gemini error", model, lastError);
    }

    throw new Error(lastError || "No se pudo conectar con Gemini.");
  }

  return { analyze };
})();