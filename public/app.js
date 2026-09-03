let currentUser=null, authMode="login", activePage="dashboard";
const $=s=>document.querySelector(s);
let loaderTimer;
function showLoader(message="Loading your workspace…"){
  const loader=$("#appLoader");
  if(!loader)return;
  $("#loaderText").textContent=message;
  loader.classList.remove("hide");
}
function hideLoader(){
  const loader=$("#appLoader");
  if(!loader)return;
  clearTimeout(loaderTimer);
  loaderTimer=setTimeout(()=>loader.classList.add("hide"),180);
}
const api=async(url,options={})=>{
  const silent=options.silent;
  const {silent:_,...fetchOptions}=options;
  if(!silent) showLoader(url.includes("/auth/")?"Signing you in…":"Syncing your workspace…");
  try{
    const r=await fetch(url,{headers:{"Content-Type":"application/json",...(fetchOptions.headers||{})},...fetchOptions});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||"Something went wrong.");
    return data;
  }finally{if(!silent)hideLoader();}
};
function setButtonLoading(btn, loading, label){
  if(!btn)return;
  if(loading){btn.dataset.label=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="spinner"></span>'+label}
  else{btn.disabled=false;btn.innerHTML=btn.dataset.label||label}
}
function toast(msg,error=false){const t=$("#toast");t.textContent=msg;t.className="toast show "+(error?"error":"");setTimeout(()=>t.className="toast",3000)}
function fmtMinutes(m){return `${Math.floor(m/60)}h ${m%60}m`}
function fmtDate(v){return v?new Date(v).toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"}):"—"}
function fmtTime(v){return v?new Date(v).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"}):"—"}
function badge(v){return `<span class="badge ${v}">${v}</span>`}

async function boot(){
  showLoader("Preparing Attendly…");
  try{const d=await api("/api/auth/me",{silent:true});currentUser=d.user;showApp()}catch{showAuth()}
  setTimeout(hideLoader,450);
}
function showAuth(){
  $("#authView").classList.remove("hidden");$("#appView").classList.add("hidden");setAuthMode("login");
}
function showApp(){
  $("#authView").classList.add("hidden");$("#appView").classList.remove("hidden");
  $("#userName").textContent=currentUser.name;$("#userRole").textContent=currentUser.role;
  $("#avatar").textContent=currentUser.name[0].toUpperCase();
  buildNav();render();
}
function buildNav(){
  const items=currentUser.role==="hr"
    ? [["dashboard","Dashboard"],["employees","Employees"],["attendance","Attendance"],["leaves","Leave Requests"]]
    : [["dashboard","Dashboard"],["attendance","My Attendance"],["leaves","My Leave"]];
  $("#nav").innerHTML=items.map(([id,label])=>`<button class="nav-btn ${activePage===id?"active":""}" onclick="go('${id}')">${label}</button>`).join("");
}
function go(p){activePage=p;buildNav();render()}
async function render(){
  $("#pageTitle").textContent=({dashboard:"Dashboard",employees:"Employees",attendance:currentUser.role==="hr"?"Attendance":"My Attendance",leaves:currentUser.role==="hr"?"Leave Requests":"My Leave"})[activePage];
  $("#content").innerHTML=`<div class="empty">Loading…</div>`;
  try{
    if(currentUser.role==="hr") return renderHR();
    return renderEmployee();
  }catch(e){$("#content").innerHTML=`<div class="card">${e.message}</div>`}
}
async function renderEmployee(){
  if(activePage==="dashboard"){
    const d=await api("/api/employee/dashboard"), today=d.today;
    $("#content").innerHTML=`
      <div class="card hero">
        <div><span class="eyebrow">GOOD ${new Date().getHours()<12?"MORNING":new Date().getHours()<18?"AFTERNOON":"EVENING"}</span><h1>Welcome, ${escapeHtml(currentUser.name.split(" ")[0])}</h1><p class="muted">Track your attendance and working hours.</p></div>
        <div style="text-align:right"><div class="clock" id="clock"></div><small>${new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</small></div>
      </div>
      <div class="grid stats section">
        <div class="card stat"><div class="label">Today's status</div><div class="value" style="font-size:20px">${today?badge(today.status):badge("absent")}</div><div class="hint">${today?.check_in?"Checked in at "+fmtTime(today.check_in):"Not checked in"}</div></div>
        <div class="card stat"><div class="label">Monthly attendance</div><div class="value">${d.month.present_days||0}</div><div class="hint">Present / late days</div></div>
        <div class="card stat"><div class="label">Hours this month</div><div class="value">${fmtMinutes(d.month.minutes||0)}</div><div class="hint">Recorded working time</div></div>
        <div class="card stat"><div class="label">Leave remaining</div><div class="value">${d.leave.remaining}</div><div class="hint">of ${d.leave.allowance} paid days</div></div>
      </div>
      <div class="card section">
        <div class="section-head"><h3>Today's attendance</h3><div class="actions">
          <button class="primary" onclick="checkIn()" ${today?.check_in?"disabled":""}>Check in</button>
          <button class="secondary" onclick="checkOut()" ${!today?.check_in||today?.check_out?"disabled":""}>Check out</button>
        </div></div>
        <table><tr><th>Check in</th><th>Check out</th><th>Working time</th><th>Status</th></tr>
        <tr><td>${fmtTime(today?.check_in)}</td><td>${fmtTime(today?.check_out)}</td><td>${fmtMinutes(today?.working_minutes||0)}</td><td>${badge(today?.status||"absent")}</td></tr></table>
      </div>`;
    tickClock();setInterval(tickClock,1000);
  } else if(activePage==="attendance"){
    const d=await api("/api/employee/attendance");
    $("#content").innerHTML=`<div class="card table-wrap"><table><thead><tr><th>Date</th><th>Check in</th><th>Check out</th><th>Working time</th><th>Status</th></tr></thead><tbody>${d.attendance.map(x=>`<tr><td>${fmtDate(x.attendance_date)}</td><td>${fmtTime(x.check_in)}</td><td>${fmtTime(x.check_out)}</td><td>${fmtMinutes(x.working_minutes)}</td><td>${badge(x.status)}</td></tr>`).join("")||`<tr><td colspan="5"><div class="empty">No attendance records yet.</div></td></tr>`}</tbody></table></div>`;
  } else {
    const d=await api("/api/employee/leaves");
    $("#content").innerHTML=`
      <div class="grid two">
        <div class="card"><h3>Request leave</h3><form id="leaveForm" class="leave-form">
          <div class="field"><label>Start date</label><input id="ls" type="date" required></div>
          <div class="field"><label>End date</label><input id="le" type="date" required></div>
          <div class="field full-row"><label>Reason</label><textarea id="lr" rows="3" placeholder="Optional"></textarea></div>
          <button class="primary full-row">Submit request</button>
        </form></div>
        <div class="card"><div class="label muted">PAID LEAVE BALANCE</div><div class="value" style="font-size:38px;font-weight:800;margin:7px 0">${d.summary.remaining}</div><p class="muted">${d.summary.used} used of ${d.summary.allowance} days</p></div>
      </div>
      <div class="card section table-wrap"><table><thead><tr><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead><tbody>${d.leaves.map(x=>`<tr><td>${fmtDate(x.start_date)} — ${fmtDate(x.end_date)}</td><td>${x.days}</td><td>${escapeHtml(x.reason||"—")}</td><td>${badge(x.status)}</td></tr>`).join("")||`<tr><td colspan="4"><div class="empty">No leave requests.</div></td></tr>`}</tbody></table></div>`;
    $("#leaveForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/employee/leaves",{method:"POST",body:JSON.stringify({start_date:$("#ls").value,end_date:$("#le").value,reason:$("#lr").value})});toast("Leave request submitted.");render()}catch(x){toast(x.message,true)}};
  }
}
function tickClock(){const c=$("#clock");if(c)c.textContent=new Date().toLocaleTimeString()}
async function checkIn(){const btn=document.querySelector('.actions .primary');setButtonLoading(btn,true,'Checking in…');try{await api("/api/attendance/check-in",{method:"POST"});toast("Check-in recorded.");render()}catch(e){setButtonLoading(btn,false,'Check in');toast(e.message,true)}}
async function checkOut(){const btn=document.querySelector('.actions .secondary');setButtonLoading(btn,true,'Checking out…');try{const d=await api("/api/attendance/check-out",{method:"POST"});toast(`Check-out recorded: ${fmtMinutes(d.working_minutes)} worked.`);render()}catch(e){setButtonLoading(btn,false,'Check out');toast(e.message,true)}}

async function renderHR(){
  if(activePage==="dashboard"){
    const d=await api("/api/hr/dashboard");
    $("#content").innerHTML=`<div class="grid stats">
      <div class="card stat"><div class="label">Employees</div><div class="value">${d.employees}</div><div class="hint">Active employee accounts</div></div>
      <div class="card stat"><div class="label">Present today</div><div class="value">${d.present}</div><div class="hint">${d.employees?Math.round(d.present/d.employees*100):0}% attendance</div></div>
      <div class="card stat"><div class="label">On leave</div><div class="value">${d.onLeave}</div><div class="hint">Approved today</div></div>
      <div class="card stat"><div class="label">Pending requests</div><div class="value">${d.pending}</div><div class="hint">Need HR review</div></div>
    </div>
    <div class="card section"><div class="section-head"><h3>Today at a glance</h3><button class="secondary" onclick="go('attendance')">View attendance</button></div>
      <div class="grid stats"><div><b>${d.present}</b><div class="muted">Present</div></div><div><b>${d.absent}</b><div class="muted">Absent / not recorded</div></div><div><b>${d.onLeave}</b><div class="muted">On approved leave</div></div><div><b>${d.pending}</b><div class="muted">Pending leave</div></div></div>
    </div>`;
  } else if(activePage==="employees"){
    const d=await api("/api/hr/employees");
    $("#content").innerHTML=`<div class="card table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Joined</th></tr></thead><tbody>${d.employees.map(x=>`<tr><td><b>${escapeHtml(x.name)}</b></td><td>${escapeHtml(x.email)}</td><td>${fmtDate(x.created_at)}</td></tr>`).join("")}</tbody></table></div>`;
  } else if(activePage==="attendance"){
    const d=await api("/api/hr/attendance?date="+encodeURIComponent(today()));
    $("#content").innerHTML=`<div class="card"><div class="section-head"><h3>Attendance — ${fmtDate(d.date)}</h3><button class="secondary" onclick="go('attendance')">Refresh</button></div><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Check in</th><th>Check out</th><th>Working time</th><th>Status</th></tr></thead><tbody>${d.attendance.map(x=>`<tr><td><b>${escapeHtml(x.name)}</b><br><small>${escapeHtml(x.email)}</small></td><td>${fmtTime(x.check_in)}</td><td>${fmtTime(x.check_out)}</td><td>${fmtMinutes(x.working_minutes||0)}</td><td>${badge(x.status||"absent")}</td></tr>`).join("")}</tbody></table></div></div>`;
  } else {
    const d=await api("/api/hr/leaves");
    $("#content").innerHTML=`<div class="card table-wrap"><table><thead><tr><th>Employee</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody>${d.leaves.map(x=>`<tr><td><b>${escapeHtml(x.name)}</b><br><small>${escapeHtml(x.email)}</small></td><td>${fmtDate(x.start_date)} — ${fmtDate(x.end_date)}</td><td>${x.days}</td><td>${escapeHtml(x.reason||"—")}</td><td>${badge(x.status)}</td><td>${x.status==="pending"?`<button class="secondary success" onclick="decideLeave(${x.id},'approved')">Approve</button> <button class="secondary danger" onclick="decideLeave(${x.id},'rejected')">Reject</button>`:"—"}</td></tr>`).join("")||`<tr><td colspan="6"><div class="empty">No leave requests.</div></td></tr>`}</tbody></table></div>`;
  }
}
async function decideLeave(id,status){try{await api("/api/hr/leaves/"+id,{method:"PATCH",body:JSON.stringify({status})});toast("Leave "+status+".");render()}catch(e){toast(e.message,true)}}

function setAuthMode(mode){
  authMode=mode;
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.auth===mode));
  $("#nameField").classList.toggle("hidden",mode==="login");
  $("#name").required=mode==="register";
  const submit=$("#authSubmit");
  submit.disabled=false;
  submit.innerHTML=mode==="login"?"Sign in":"Create account";
  delete submit.dataset.label;
}
document.querySelectorAll(".tab").forEach(x=>x.onclick=()=>setAuthMode(x.dataset.auth));
$("#authForm").onsubmit=async e=>{
  e.preventDefault();
  const submit=$("#authSubmit");
  const mode=authMode;
  try{
    const email=$("#email").value.trim().toLowerCase();
    const password=$("#password").value;
    const body={email,password};
    if(mode==="register")body.name=$("#name").value.trim();
    if(mode==="register" && !body.name){throw new Error("Please enter your full name.");}
    if(!email){throw new Error("Please enter your email address.");}
    if(password.length<8){throw new Error("Password must be at least 8 characters.");}
    setButtonLoading(submit,true,mode==="login"?"Signing in…":"Creating account…");
    const d=await api("/api/auth/"+mode,{method:"POST",body:JSON.stringify(body)});
    currentUser=d.user;
    showApp();
    toast(mode==="login"?"Welcome back!":"Account created successfully!");
  }catch(x){
    setButtonLoading(submit,false,mode==="login"?"Sign in":"Create account");
    toast(x.message||"Unable to complete the request.",true);
  }
};
$("#logout").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});currentUser=null;showAuth();toast("Signed out.")};
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
boot();
