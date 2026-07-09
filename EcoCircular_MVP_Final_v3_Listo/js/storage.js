const Store = (() => {
  const KEY = "ecocircular_final_projects";
  const ACTIVE = "ecocircular_final_active";
  const memory = { projects: [], active: null };

  function available(){
    try{
      localStorage.setItem("__eco_test","1");
      localStorage.removeItem("__eco_test");
      return true;
    }catch(e){ return false; }
  }

  function loadProjects(){
    try{
      if(available()) return JSON.parse(localStorage.getItem(KEY) || "[]");
    }catch(e){}
    return memory.projects;
  }

  function loadActive(){
    try{
      if(available()) return localStorage.getItem(ACTIVE);
    }catch(e){}
    return memory.active;
  }

  function save(projects, activeId){
    try{
      if(available()){
        localStorage.setItem(KEY, JSON.stringify(projects));
        if(activeId) localStorage.setItem(ACTIVE, activeId);
      } else {
        memory.projects = projects;
        memory.active = activeId;
      }
    }catch(e){
      memory.projects = projects;
      memory.active = activeId;
    }
  }

  return { loadProjects, loadActive, save };
})();