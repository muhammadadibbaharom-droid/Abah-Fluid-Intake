const LIMIT = 500;
const START_HOUR = 6;
const STORAGE_KEY = "fluidMonitorV3";
let selectedAmount = null;

const $ = id => document.getElementById(id);

function pad(n){return String(n).padStart(2,"0");}
function localDateKey(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}

/* Monitoring cycle date = calendar date on which the 6 AM cycle started. */
function cycleKeyFromDateTime(dateObj){
  const d = new Date(dateObj);
  if(d.getHours() < START_HOUR) d.setDate(d.getDate()-1);
  return localDateKey(d);
}
function currentCycleKey(){return cycleKeyFromDateTime(new Date());}

function formatCycle(key){
  const start = new Date(key+"T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate()+1);
  return `${start.toLocaleDateString([], {day:"numeric",month:"short",year:"numeric"})} 6:00 AM → ${end.toLocaleDateString([], {day:"numeric",month:"short",year:"numeric"})} 5:59 AM`;
}
function load(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");}catch{return {};}
}
function save(data){localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}
function entriesFor(key){
  const data=load();
  return Array.isArray(data.cycles?.[key]) ? data.cycles[key] : [];
}
function setEntries(key, entries){
  const data=load();
  data.cycles=data.cycles||{};
  data.cycles[key]=entries;
  save(data);
}
function selectedIntakeDateTime(){
  return new Date(`${$("entryDate").value}T${$("entryTime").value}`);
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}

function renderCurrent(){
  const key=currentCycleKey();
  const entries=entriesFor(key).sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt));
  const total=entries.reduce((s,e)=>s+Number(e.amount),0);

  $("total").textContent=Math.round(total);
  $("progress").style.width=`${Math.min(total/LIMIT*100,100)}%`;
  $("progress").classList.toggle("over",total>LIMIT);
  const remaining=LIMIT-total;
  $("remainingText").textContent=remaining>=0?`${Math.round(remaining)} mL remaining`:`${Math.round(-remaining)} mL over limit`;
  $("status").className="status "+(total>LIMIT?"over":total>=LIMIT*.8?"warn":"ok");
  $("status").textContent=total>LIMIT?"Over limit":total>=LIMIT*.8?"Near limit":"Within limit";
  $("cycleLabel").textContent=`Current cycle: ${formatCycle(key)}`;
  $("historyLabel").textContent=formatCycle(key);

  $("empty").style.display=entries.length?"none":"block";
  $("entries").innerHTML=entries.map(e=>`
    <div class="entry">
      <div>
        <div class="amount">${Math.round(e.amount)} mL</div>
        <div class="remark">${escapeHtml(e.remark)}</div>
        <div class="time">Intake: ${new Date(e.intakeAt).toLocaleString([], {day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})}<br>
        Submitted: ${new Date(e.submittedAt).toLocaleString([], {day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"})}</div>
      </div>
      <button class="delete" type="button" data-id="${e.id}">×</button>
    </div>`).join("");

  document.querySelectorAll(".delete").forEach(btn=>btn.addEventListener("click",()=>{
    setEntries(key,entriesFor(key).filter(e=>e.id!==btn.dataset.id)); renderAll();
  }));
}

function renderSummaries(){
  const data=load();
  const cycles=data.cycles||{};
  const keys=Object.keys(cycles).filter(k=>k<currentCycleKey()).sort((a,b)=>b.localeCompare(a));
  $("summaryEmpty").style.display=keys.length?"none":"block";
  $("summaries").innerHTML=keys.map(key=>{
    const es=Array.isArray(cycles[key])?cycles[key]:[];
    const total=es.reduce((s,e)=>s+Number(e.amount),0);
    const over=total>LIMIT;
    return `<div class="summary-item">
      <div class="summary-top"><span>${formatCycle(key)}</span><span>${Math.round(total)} / ${LIMIT} mL</span></div>
      <div class="summary-detail">${es.length} entr${es.length===1?"y":"ies"} · <span class="${over?"summary-over":"summary-ok"}">${over?`${Math.round(total-LIMIT)} mL over`:`${Math.round(LIMIT-total)} mL remaining`}</span></div>
    </div>`;
  }).join("");
}

function renderAll(){renderCurrent();renderSummaries();}

$("quickButtons").innerHTML=Array.from({length:10},(_,i)=>(i+1)*10)
 .map(n=>`<button class="quick-btn" type="button" data-amount="${n}">${n} mL</button>`).join("");
document.querySelectorAll(".quick-btn").forEach(btn=>btn.addEventListener("click",()=>{
 selectedAmount=Number(btn.dataset.amount);
 document.querySelectorAll(".quick-btn").forEach(b=>b.classList.remove("selected"));
 btn.classList.add("selected"); $("formError").textContent="";
}));

$("submitBtn").addEventListener("click",()=>{
 const intake=selectedIntakeDateTime();
 const cycle=currentCycleKey();
 if(!selectedAmount){$("formError").textContent="Please select an amount.";return;}
 if(!$("remark").value.trim()){$("formError").textContent="Please enter a remark.";return;}
 if(Number.isNaN(intake.getTime())){$("formError").textContent="Please select a valid intake date and time.";return;}
 if(cycleFromIntake(intake)!==cycle){
   $("formError").textContent="The intake date/time must be within the current 6 AM monitoring cycle."; return;
 }
 const es=entriesFor(cycle);
 es.push({
   id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),
   amount:selectedAmount,
   remark:$("remark").value.trim(),
   intakeAt:intake.toISOString(),
   submittedAt:new Date().toISOString()
 });
 setEntries(cycle,es);
 selectedAmount=null; $("remark").value=""; $("formError").textContent="";
 document.querySelectorAll(".quick-btn").forEach(b=>b.classList.remove("selected"));
 renderAll();
});

function cycleFromIntake(d){return cycleKeyFromDateTime(d);}

$("clearBtn").addEventListener("click",()=>{
 const key=currentCycleKey();
 if(confirm("Clear all records in the current 6 AM cycle?")){setEntries(key,[]);renderAll();}
});
$("resetBtn").addEventListener("click",()=>{
 const key=currentCycleKey();
 if(confirm("Reset all records in the current 6 AM cycle?")){setEntries(key,[]);renderAll();}
});

const now=new Date();
$("entryDate").value=localDateKey(now);
$("entryTime").value=`${pad(now.getHours())}:${pad(now.getMinutes())}`;
renderAll();
