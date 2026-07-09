(() => {
  let projects = Store.loadProjects();
  let activeId = Store.loadActive();
  let filter = "Todas";
  let lastCreate = 0;

  const $ = id => document.getElementById(id);
  const activeProject = () => projects.find(p => p.id === activeId);

  function save(){ Store.save(projects, activeId); }

  function esc(v){
    return String(v ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function setProgress(percent, msg){
    $("progressWrap").style.display = "block";
    $("progressBar").style.width = percent + "%";
    if(msg) $("estado").textContent = msg;
  }

  function hideProgress(){
    setTimeout(() => {
      $("progressWrap").style.display = "none";
      $("progressBar").style.width = "0%";
    }, 800);
  }

  function init(){
    $("promptIA").value = ECO_PROMPT;

    $("crearProyecto").addEventListener("click", createProject);
    $("analizarIA").addEventListener("click", analyzeIA);
    $("analizarReglas").addEventListener("click", analyzeRules);
    $("cargarEjemplo").addEventListener("click", loadExample);
    $("agregarObligacion").addEventListener("click", addObligation);
    $("exportarExcel").addEventListener("click", exportExcel);
    $("guardarProyecto").addEventListener("click", () => { save(); alert("Proyecto guardado."); });
    $("limpiarObligaciones").addEventListener("click", clearObligations);
    $("nuevoAnalisis").addEventListener("click", () => { $("archivoPDF").value = ""; $("estado").textContent = "Listo para nuevo análisis."; });
    $("cerrarModal").addEventListener("click", closeModal);

    document.querySelectorAll(".filter").forEach(btn => {
      btn.addEventListener("click", () => {
        filter = btn.dataset.filter;
        document.querySelectorAll(".filter").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderTable();
      });
    });

    renderProjects();
    if(activeId && activeProject()) openProject(activeId, false);
  }

  function createProject(){
    const now = Date.now();
    if(now - lastCreate < 800) return;
    lastCreate = now;

    const cliente = $("cliente").value.trim();
    const nombre = $("proyecto").value.trim();
    const responsable = $("responsable").value.trim() || "No asignado";

    if(!cliente || !nombre){
      alert("Completa cliente y nombre del proyecto.");
      return;
    }

    const project = {
      id:String(Date.now()),
      cliente,
      nombre,
      responsable,
      fecha:new Date().toLocaleDateString("es-CL"),
      archivo:"",
      obligaciones:[]
    };

    projects.push(project);
    activeId = project.id;
    save();

    $("cliente").value = "";
    $("proyecto").value = "";
    $("responsable").value = "";

    renderProjects();
    openProject(project.id, true);
  }

  function renderProjects(){
    const container = $("listaProyectos");
    container.innerHTML = "";

    if(projects.length === 0){
      container.innerHTML = '<p class="muted">Aún no hay proyectos creados.</p>';
      return;
    }

    projects.forEach(p => {
      const div = document.createElement("div");
      div.className = "project-item" + (p.id === activeId ? " active" : "");
      div.innerHTML = `<strong>${esc(p.nombre)}</strong><span class="muted">${esc(p.cliente)}</span><br><span class="muted">${p.obligaciones.length} obligaciones · ${p.fecha}</span>`;
      div.addEventListener("click", () => openProject(p.id, true));
      container.appendChild(div);
    });
  }

  function openProject(id, scroll){
    activeId = id;
    save();

    const p = activeProject();
    if(!p) return;

    $("bienvenida").classList.add("hidden");
    $("workspace").classList.remove("hidden");
    $("tituloProyecto").textContent = p.nombre;
    $("detalleProyecto").textContent = `Cliente: ${p.cliente} | Responsable EcoCircular: ${p.responsable} | Fecha: ${p.fecha}`;

    renderProjects();
    renderTable();
    updateMetrics();

    if(scroll) setTimeout(() => $("workspace").scrollIntoView({ behavior:"smooth", block:"start" }), 100);
  }

  async function readCurrentPDF(){
    const p = activeProject();
    if(!p) throw new Error("Primero crea un proyecto.");

    const file = $("archivoPDF").files[0];
    if(!file) throw new Error("Selecciona un PDF.");

    p.archivo = file.name;
    updateMetrics();
    return await PdfReader.read(file);
  }

  async function analyzeIA(){
    const p = activeProject();
    if(!p) return alert("Primero crea un proyecto.");

    const apiKey = $("apiKey").value.trim();
    if(!apiKey) return alert("Pega tu API Key Gemini.");

    try{
      setProgress(15, "Extrayendo texto del PDF...");
      const pages = await readCurrentPDF();

      setProgress(45, "Generando propuesta con IA...");
      const result = await Gemini.analyze(apiKey, pages);

      p.obligaciones = result
        .filter(x => x && (x.obligacion || x.extracto))
        .map(x => ({
          pagina:String(x.pagina || ""),
          obligacion:x.obligacion || "",
          tipo:x.tipo || x.categoria || "Cumplimiento ambiental",
          plazo:x.plazo || "",
          referencia:x.referencia || x.fundamento || "",
          extracto:x.extracto || x.texto_fuente || "",
          estado:normalizeState(x.estado || x.estado_revision)
        }));

      deduplicate(p);
      save();
      renderTable();
      updateMetrics();
      renderProjects();

      setProgress(100, `Análisis terminado. Se generaron ${p.obligaciones.length} obligaciones para revisión.`);
      hideProgress();
    }catch(e){
      console.error(e);
      alert(e.message || "No se pudo analizar con IA.");
      $("estado").textContent = "Error en análisis con IA.";
      hideProgress();
    }
  }

  async function analyzeRules(){
    const p = activeProject();
    if(!p) return alert("Primero crea un proyecto.");

    try{
      setProgress(20, "Leyendo PDF con reglas locales...");
      const pages = await readCurrentPDF();

      p.obligaciones = [];
      pages.forEach(pg => detectRules(pg.text, pg.page, p));
      deduplicate(p);

      save();
      renderTable();
      updateMetrics();
      renderProjects();

      setProgress(100, `Análisis rápido terminado. Se detectaron ${p.obligaciones.length} posibles obligaciones.`);
      hideProgress();
    }catch(e){
      console.error(e);
      alert(e.message || "No se pudo leer el PDF.");
      hideProgress();
    }
  }

  function detectRules(text, page, project){
    const keys = ["deberá","debe","cumplir","informar","reportar","monitorear","mantener registro","residuos","emisiones","ruido","capacitar","permiso","fiscalización"];
    text.split(/(?<=[.;:])\s+/).forEach(sentence => {
      const s = sentence.trim().replace(/\s+/g," ");
      const low = s.toLowerCase();
      if(s.length > 55 && keys.some(k => low.includes(k))){
        project.obligaciones.push({
          pagina:String(page),
          obligacion:s.substring(0,230),
          tipo:classify(s),
          plazo:detectDeadline(s),
          referencia:detectReference(s) || `Página ${page}`,
          extracto:s.substring(0,420),
          estado:"Requiere revisión"
        });
      }
    });
  }

  function classify(t){
    t = t.toLowerCase();
    if(t.includes("ruido")) return "Ruido";
    if(t.includes("residuo")) return "Residuos";
    if(t.includes("emision") || t.includes("polvo") || t.includes("partículas")) return "Emisiones";
    if(t.includes("agua")) return "Agua";
    if(t.includes("flora") || t.includes("fauna")) return "Biodiversidad";
    if(t.includes("monitoreo") || t.includes("seguimiento")) return "Monitoreo";
    if(t.includes("capacitación") || t.includes("capacitar")) return "Capacitación";
    if(t.includes("informar") || t.includes("reportar")) return "Reporte";
    if(t.includes("permiso") || t.includes("pas ")) return "Permiso";
    if(t.includes("registro")) return "Registro";
    return "Cumplimiento ambiental";
  }

  function detectDeadline(t){
    const m = t.match(/(\d+\s*(días|dias|meses|años|anos|hábiles|habiles))/i);
    if(m) return m[0];
    if(/fase de construcción/i.test(t)) return "Fase de construcción";
    if(/fase de operación/i.test(t)) return "Fase de operación";
    return "";
  }

  function detectReference(t){
    const c = t.match(/considerando\s+\d+°?/i);
    if(c) return c[0];
    const r = t.match(/resuelvo\s+(primero|segundo|tercero|cuarto|quinto)/i);
    if(r) return r[0];
    const a = t.match(/artículo\s+\d+\s*[a-z]*/i);
    if(a) return a[0];
    return "";
  }

  function normalizeState(s){
    s = String(s || "").toLowerCase();
    if(s.includes("valid")) return "Validada";
    return "Requiere revisión";
  }

  function deduplicate(project){
    const seen = new Set();
    project.obligaciones = project.obligaciones.filter(o => {
      const key = (o.obligacion || "").toLowerCase().replace(/\s+/g," ").slice(0,150);
      if(!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function loadExample(){
    const p = activeProject();
    if(!p) return alert("Primero crea un proyecto.");

    p.archivo = p.archivo || "RCA_publica_de_prueba.pdf";
    p.obligaciones = [
      {
        pagina:"9",
        obligacion:"Humectar superficies para evitar resuspensión de polvo durante la fase de construcción.",
        tipo:"Medida de control ambiental",
        plazo:"Fase de construcción",
        referencia:"Página 9",
        extracto:"Humectar las superficies cuando se produzca mayor desplazamiento interno de vehículos y camiones para evitar la resuspensión de polvo.",
        estado:"Requiere revisión"
      },
      {
        pagina:"5",
        obligacion:"Ejecutar el proyecto con estricto apego a las condiciones y exigencias establecidas en la RCA.",
        tipo:"Cumplimiento ambiental",
        plazo:"",
        referencia:"Resuelvo Segundo",
        extracto:"El titular debe ejecutar su proyecto con estricto apego de las condiciones y exigencias establecidas en dicha resolución.",
        estado:"Validada"
      }
    ];

    save();
    renderTable();
    updateMetrics();
    renderProjects();
  }

  function renderTable(){
    const p = activeProject();
    const tbody = $("tablaObligaciones");
    tbody.innerHTML = "";
    if(!p) return;

    const rows = p.obligaciones.filter(o => filter === "Todas" || o.estado === filter);

    if(rows.length === 0){
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No hay obligaciones para mostrar.</td></tr>';
      return;
    }

    rows.forEach(o => {
      const index = p.obligaciones.indexOf(o);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td contenteditable="true" data-field="pagina">${esc(o.pagina)}</td>
        <td contenteditable="true" data-field="obligacion">${esc(o.obligacion)}</td>
        <td contenteditable="true" data-field="tipo">${esc(o.tipo)}</td>
        <td contenteditable="true" data-field="plazo">${esc(o.plazo)}</td>
        <td contenteditable="true" data-field="referencia">${esc(o.referencia)}</td>
        <td>
          <select data-field="estado">
            <option ${o.estado === "Requiere revisión" ? "selected" : ""}>Requiere revisión</option>
            <option ${o.estado === "Validada" ? "selected" : ""}>Validada</option>
          </select>
        </td>
        <td class="row-actions">
          <button class="small-btn blue" data-action="view">Ver extracto</button>
          <button class="small-btn red" data-action="delete">Eliminar</button>
        </td>
      `;

      tr.querySelectorAll("[contenteditable=true]").forEach(cell => {
        cell.addEventListener("input", () => {
          o[cell.dataset.field] = cell.textContent.trim();
          save();
        });
      });

      tr.querySelector("select").addEventListener("change", ev => {
        o.estado = ev.target.value;
        save();
        updateMetrics();
        renderTable();
      });

      tr.querySelector("[data-action='view']").addEventListener("click", () => openModal(o));
      tr.querySelector("[data-action='delete']").addEventListener("click", () => {
        p.obligaciones.splice(index, 1);
        save();
        renderTable();
        updateMetrics();
        renderProjects();
      });

      tbody.appendChild(tr);
    });
  }

  function addObligation(){
    const p = activeProject();
    if(!p) return alert("Primero crea un proyecto.");

    p.obligaciones.push({
      pagina:"",
      obligacion:"Nueva obligación ambiental",
      tipo:"Cumplimiento ambiental",
      plazo:"",
      referencia:"",
      extracto:"",
      estado:"Requiere revisión"
    });

    save();
    renderTable();
    updateMetrics();
    renderProjects();
  }

  function updateMetrics(){
    const p = activeProject();
    if(!p) return;

    $("metricaTotal").textContent = p.obligaciones.length;
    $("metricaRevision").textContent = p.obligaciones.filter(o => o.estado === "Requiere revisión").length;
    $("metricaValidadas").textContent = p.obligaciones.filter(o => o.estado === "Validada").length;
    $("metricaArchivo").textContent = p.archivo || "Sin PDF";
  }

  function clearObligations(){
    const p = activeProject();
    if(!p) return;
    if(confirm("¿Eliminar todas las obligaciones del proyecto actual?")){
      p.obligaciones = [];
      save();
      renderTable();
      updateMetrics();
      renderProjects();
    }
  }

  function exportExcel(){
    try{
      ExcelExport.exportProject(activeProject());
    }catch(e){
      alert(e.message || "No se pudo exportar Excel.");
    }
  }

  function openModal(o){
    $("modalMeta").textContent = `Página ${o.pagina || "sin página"} · ${o.referencia || "sin referencia"}`;
    $("modalTexto").textContent = o.extracto || "Sin extracto disponible.";
    $("modal").style.display = "flex";
  }

  function closeModal(){
    $("modal").style.display = "none";
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();