const ExcelExport = (() => {
  function safeName(name){
    return name.replace(/[\\/:*?"<>|]/g,"_").replace(/\s+/g,"_");
  }

  function exportProject(project){
    if(!window.XLSX) throw new Error("No se pudo cargar XLSX.");
    if(!project || project.obligaciones.length === 0) throw new Error("No hay obligaciones para exportar.");

    const validadas = project.obligaciones.filter(o => o.estado === "Validada").length;
    const revision = project.obligaciones.filter(o => o.estado === "Requiere revisión").length;

    const resumen = [
      ["EcoCircular", "Sistema Inteligente de Gestión de Cumplimiento Ambiental"],
      ["Slogan", "Cambios positivos para la protección del medio ambiente"],
      [],
      ["Cliente / titular", project.cliente],
      ["Proyecto", project.nombre],
      ["Responsable EcoCircular", project.responsable],
      ["Documento", project.archivo || "Sin PDF"],
      ["Fecha de exportación", new Date().toLocaleString("es-CL")],
      [],
      ["Resumen", ""],
      ["Obligaciones detectadas", project.obligaciones.length],
      ["Requieren revisión", revision],
      ["Validadas", validadas],
      [],
      ["Nota", "La propuesta generada mediante IA es un apoyo para revisión documental y no reemplaza la validación técnica de un profesional."]
    ];

    const data = project.obligaciones.map((o, i) => ({
      "N°": i + 1,
      "Cliente / titular": project.cliente,
      "Proyecto": project.nombre,
      "Documento": project.archivo,
      "Página RCA": o.pagina,
      "Obligación": o.obligacion,
      "Tipo": o.tipo,
      "Plazo": o.plazo,
      "Referencia RCA": o.referencia,
      "Extracto RCA": o.extracto,
      "Estado": o.estado
    }));

    const wb = XLSX.utils.book_new();

    const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
    wsResumen["!cols"] = [{wch:26},{wch:80}];
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      {wch:6},{wch:24},{wch:30},{wch:30},{wch:10},
      {wch:62},{wch:24},{wch:18},{wch:22},{wch:75},{wch:20}
    ];
    ws["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws["!ref"])) };
    XLSX.utils.book_append_sheet(wb, ws, "Obligaciones RCA");

    XLSX.writeFile(wb, safeName(`EcoCircular_${project.nombre}_Obligaciones.xlsx`));
  }

  return { exportProject };
})();