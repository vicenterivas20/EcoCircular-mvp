const PdfReader = (() => {
  if(window.pdfjsLib){
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  async function read(file){
    if(!window.pdfjsLib) throw new Error("No se pudo cargar PDF.js.");
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(new Uint8Array(buffer)).promise;
    const pages = [];

    for(let i = 1; i <= pdf.numPages; i++){
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(" ").replace(/\s+/g," ");
      pages.push({ page:i, text });
    }

    return pages;
  }

  return { read };
})();