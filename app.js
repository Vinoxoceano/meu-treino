import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL='https://moltssnwfnekeykqfraq.supabase.co';
const SUPABASE_KEY='sb_publishable_u-_PnjF-rPiS5j68GsoZSA_0xjhACuf';
const sb=createClient(SUPABASE_URL,SUPABASE_KEY);

const root=document.getElementById('app');
const timerBox=document.getElementById('timer');
const state={
  user:null, days:[], day:null, session:null,
  settings:{auto_rest:true,sound_enabled:true,vibration_enabled:true},
  timer:null,left:0,paused:false,restEndAt:null,restPausedRemainingMs:null,restNotificationId:null,pushEnabled:false,restContext:null,workoutClock:null,tab:'treino',variants:{},
  cardio:{modality:'Esteira',minutes:'',intensity:'moderado'}
};

const esc=s=>(s??'').toString().replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const num=v=>v===''||v==null?null:Number(String(v).replace(',','.'));
const fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const duration=(a,b)=>{if(!a)return '—';const end=b?new Date(b):new Date();const total=Math.max(0,Math.floor((end-new Date(a))/1000));const h=Math.floor(total/3600);const m=Math.floor((total%3600)/60);const sec=total%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`};
const workoutLetter=d=>String.fromCharCode(64+Math.max(1,Number(d?.sort_order||1)));
const workoutDisplayTitle=d=>{if(!d)return 'Treino';const parts=(d.title||'').split('—');const focus=parts.length>1?parts.slice(1).join('—').trim():(d.focus||'').split(';')[0].trim();return `Treino ${workoutLetter(d)}${focus?` — ${focus}`:''}`};
const variantKey=exId=>`meu-treino:variant:${exId}`;
const dataCacheKey=userId=>`meu-treino:data:${userId}`;
const lastCacheKey=(exId,variantId)=>`meu-treino:last:${exId}:${variantId||'base'}`;

function normalizeDays(days=[]){
  const sorted=[...days].sort((a,b)=>a.sort_order-b.sort_order);
  sorted.forEach(d=>d.workout_exercises=(d.workout_exercises||[]).sort((a,b)=>a.sort_order-b.sort_order));
  return sorted;
}
function restoreDataCache(){
  if(!state.user)return false;
  try{
    const cached=JSON.parse(localStorage.getItem(dataCacheKey(state.user.id))||'null');
    if(!cached?.days?.length)return false;
    state.days=normalizeDays(cached.days);
    state.settings=cached.settings||state.settings;
    state.day=state.days.find(d=>d.weekday===new Date().getDay())||state.days[0]||null;
    return true;
  }catch{return false}
}
function saveDataCache(){
  if(!state.user||!state.days.length)return;
  try{localStorage.setItem(dataCacheKey(state.user.id),JSON.stringify({days:state.days,settings:state.settings}))}catch{}
}
function getCachedLast(exId,variantId){
  try{return JSON.parse(localStorage.getItem(lastCacheKey(exId,variantId))||'null')}catch{return null}
}
function setCachedLast(exId,variantId,value){
  try{localStorage.setItem(lastCacheKey(exId,variantId),JSON.stringify(value))}catch{}
}

const draftKey=(dayId,exId,setNo)=>`meu-treino:draft:${state.user?.id||'anon'}:${dayId}:${exId}:${setNo}`;
function saveDraft(card){if(!state.day)return;const ex=card.closest('.exercise');const p={variantId:ex.querySelector('.variant')?.value||null,weight:card.querySelector('.kg')?.value||'',reps:card.querySelector('.reps')?.value||'',rir:card.querySelector('.rir')?.value||'',poor:!!card.querySelector('.poor')?.checked};try{localStorage.setItem(draftKey(state.day.id,ex.dataset.ex,Number(card.dataset.set)),JSON.stringify(p))}catch{}}
function restoreDraft(card){if(!state.day)return;const ex=card.closest('.exercise');try{const d=JSON.parse(localStorage.getItem(draftKey(state.day.id,ex.dataset.ex,Number(card.dataset.set)))||'null');if(!d)return;const v=ex.querySelector('.variant')?.value||null;if(d.variantId!==v)return;if(d.weight!==undefined)card.querySelector('.kg').value=d.weight;if(d.reps!==undefined)card.querySelector('.reps').value=d.reps;if(d.rir!==undefined)card.querySelector('.rir').value=d.rir;const poor=card.querySelector('.poor');if(poor)poor.checked=!!d.poor}catch{}}
function clearDraft(card){const ex=card.closest('.exercise');try{localStorage.removeItem(draftKey(state.day.id,ex.dataset.ex,Number(card.dataset.set)))}catch{}}
function markSetDone(card){card.classList.add('done');card.querySelectorAll('input,select').forEach(x=>x.disabled=true);const btn=card.querySelector('.saveSet');if(btn){btn.disabled=true;btn.textContent='Concluída ✓'}clearDraft(card)}
function updateExerciseProgress(el,ex){const done=el.querySelectorAll('.setcard.done').length;const count=el.querySelector('.exercise-count');if(count)count.textContent=`${done}/${ex.working_sets}`;if(done>=ex.working_sets){el.classList.add('complete','collapsed');const btn=el.querySelector('.collapseExercise');if(btn)btn.textContent='+'}}


function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}

async function getServiceWorkerRegistration(){
  if(!('serviceWorker' in navigator))return null;
  let reg=await navigator.serviceWorker.getRegistration();
  if(!reg)reg=await navigator.serviceWorker.ready;
  return reg;
}

async function refreshPushCapability(){
  try{
    if(!('Notification' in window)||!('PushManager' in window)){state.pushEnabled=false;return false}
    const reg=await getServiceWorkerRegistration();
    const sub=await reg?.pushManager?.getSubscription();
    state.pushEnabled=!!sub && Notification.permission==='granted';
    return state.pushEnabled;
  }catch{
    state.pushEnabled=false;
    return false;
  }
}

async function enablePushNotifications(){
  if(!('Notification' in window)||!('PushManager' in window))throw new Error('Este aparelho não oferece notificações web compatíveis.');
  const permission=await Notification.requestPermission();
  if(permission!=='granted')throw new Error('Permissão de notificações não concedida.');

  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw new Error('Sessão expirada. Entre novamente no app.');

  const {data,error}=await sb.functions.invoke('workout-push-setup',{body:{action:'public-key'}});
  if(error)throw error;
  const publicKey=data?.publicKey;
  if(!publicKey)throw new Error('Não foi possível configurar a chave de notificações.');

  const reg=await getServiceWorkerRegistration();
  let sub=await reg.pushManager.getSubscription();
  if(!sub){
    sub=await reg.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:urlBase64ToUint8Array(publicKey)
    });
  }

  const json=sub.toJSON();
  const {error:saveError}=await sb.from('workout_push_subscriptions').upsert({
    user_id:state.user.id,
    endpoint:json.endpoint,
    subscription:json,
    user_agent:navigator.userAgent,
    updated_at:new Date().toISOString()
  },{onConflict:'endpoint'});
  if(saveError)throw saveError;

  state.pushEnabled=true;
  return true;
}

async function scheduleRestPush(dueAt){
  if(!state.pushEnabled||!state.user||!state.session||!dueAt)return;
  try{
    if(state.restNotificationId){
      await sb.from('workout_rest_notifications')
        .update({due_at:new Date(dueAt).toISOString(),canceled_at:null,processing_at:null})
        .eq('id',state.restNotificationId)
        .eq('user_id',state.user.id);
      return;
    }
    const {data,error}=await sb.from('workout_rest_notifications').insert({
      user_id:state.user.id,
      session_id:state.session.id,
      due_at:new Date(dueAt).toISOString(),
      title:'Descanso concluído',
      body:'Hora da próxima série.'
    }).select('id').single();
    if(!error&&data)state.restNotificationId=data.id;
  }catch{}
}

async function cancelRestPush(){
  const id=state.restNotificationId;
  state.restNotificationId=null;
  if(!id||!state.user)return;
  try{
    await sb.from('workout_rest_notifications')
      .update({canceled_at:new Date().toISOString(),processing_at:null})
      .eq('id',id)
      .eq('user_id',state.user.id)
      .is('sent_at',null);
  }catch{}
}

async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(session){
    state.user=session.user;
    if(restoreDataCache())render();
    await loadData();
    await refreshPushCapability();
  }
  render();

  sb.auth.onAuthStateChange(async(event,s)=>{
    const nextUser=s?.user||null;
    if(event==='SIGNED_OUT'||!nextUser){
      if(state.user){
        state.user=null;state.days=[];state.day=null;state.session=null;
        render();
      }
      return;
    }

    const changedUser=state.user?.id!==nextUser.id;
    state.user=nextUser;

    // Supabase pode emitir SIGNED_IN novamente ao voltar ao app.
    // Não recarregamos tudo se o mesmo usuário já está em memória.
    if(event==='SIGNED_IN'&&(changedUser||!state.days.length)){
      restoreDataCache();
      render();
      await loadData();
      render();
    }
  });
}

async function loadData(){
  if(!state.user)return;
  const programQuery=sb.from('workout_programs')
    .select('id,name,workout_days(id,weekday,title,focus,sort_order,workout_exercises(id,name,variant_note,category,is_secondary,sort_order,working_sets,rep_min,rep_max,rest_seconds,workout_exercise_variants(id,name,is_default,sort_order,weight_increment_kg)))')
    .eq('active',true).order('created_at',{ascending:false}).limit(1).maybeSingle();
  const settingsQuery=sb.from('workout_user_settings').select('*').maybeSingle();
  const sessionQuery=sb.from('workout_sessions').select('*')
    .eq('user_id',state.user.id).is('ended_at',null)
    .order('started_at',{ascending:false}).limit(1).maybeSingle();

  const [{data,error},{data:settings},{data:openSession}]=await Promise.all([programQuery,settingsQuery,sessionQuery]);
  if(error)console.error(error);

  const previousDayId=state.day?.id;
  state.days=normalizeDays(data?.workout_days||state.days);
  if(settings)state.settings=settings;

  state.session=openSession||null;
  if(openSession){
    state.day=state.days.find(x=>x.id===openSession.workout_day_id)
      ||state.days.find(d=>d.weekday===new Date().getDay())||state.days[0]||null;
  }else{
    state.day=state.days.find(d=>d.id===previousDayId)
      ||state.days.find(d=>d.weekday===new Date().getDay())||state.days[0]||null;
  }
  saveDataCache();
}

function nav(){return `<div class="tabs">${['treino','historico','corpo','ajustes'].map(x=>`<button data-tab="${x}" class="${state.tab===x?'active':''}">${x[0].toUpperCase()+x.slice(1)}</button>`).join('')}</div>`}

function render(){
  if(!state.user){
    root.innerHTML=`<div class="login"><div class="brand">Meu Treino</div><p class="muted">Seu treino, histórico e medidas em um só lugar.</p><div class="card"><div class="field"><label>Email</label><input id="email" type="email" autocomplete="email"></div><div class="field" style="margin-top:10px"><label>Senha</label><input id="pass" type="password" autocomplete="current-password"></div><button id="login" class="btn" style="width:100%;margin-top:14px">Entrar</button><div id="msg" class="small" style="color:#fecaca;margin-top:8px"></div></div></div>`;
    document.getElementById('login').onclick=login;return;
  }
  root.innerHTML=`<div class="shell"><div class="row between"><div><div class="brand">Meu Treino</div><div class="small muted">${esc(state.user.email)}</div></div><button id="logout" class="btn secondary">Sair</button></div><div id="content"></div></div>${nav()}`;
  document.getElementById('logout').onclick=()=>sb.auth.signOut();
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render()});
  renderTab();
}

async function login(){
  const email=document.getElementById('email').value.trim();
  const password=document.getElementById('pass').value;
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error)document.getElementById('msg').textContent=error.message;
}

function renderTab(){
  stopWorkoutClock();
  const c=document.getElementById('content');
  if(state.tab==='treino')return renderWorkout(c);
  if(state.tab==='historico')return renderHistory(c);
  if(state.tab==='corpo')return renderBody(c);
  return renderSettings(c);
}

function selectedVariant(ex){
  const vars=(ex.workout_exercise_variants||[]).sort((a,b)=>a.sort_order-b.sort_order);
  if(!vars.length)return null;
  const remembered=state.variants[ex.id]||localStorage.getItem(variantKey(ex.id));
  const chosen=vars.find(v=>v.id===remembered)||vars.find(v=>v.is_default)||vars[0];
  state.variants[ex.id]=chosen.id;
  return chosen;
}

async function lastFor(ex,variant){
  let q=sb.from('workout_set_logs')
    .select('session_id,set_number,weight_kg,reps,rir,technique_status,completed_at,workout_sessions!inner(started_at,ended_at)')
    .eq('exercise_id',ex.id).order('completed_at',{ascending:false}).limit(60);
  q=variant?q.eq('variant_id',variant):q.is('variant_id',null);
  const {data=[]}=await q;
  if(!data.length){const empty={text:'Sem histórico nesta variação.',weight:null,sessionId:null,sets:[],top:false,below:false};setCachedLast(ex.id,variant,empty);return empty;}
  const latestSession=data[0].session_id;
  const sets=data.filter(x=>x.session_id===latestSession).sort((a,b)=>a.set_number-b.set_number);
  const complete=sets.length>=ex.working_sets;
  const valid=complete&&sets.slice(0,ex.working_sets).every(x=>x.technique_status==='normal');
  const top=valid&&sets.slice(0,ex.working_sets).every(x=>x.reps>=ex.rep_max);
  const below=complete&&sets.slice(0,ex.working_sets).filter(x=>x.reps<ex.rep_min).length>=2;
  const weight=sets[0]?.weight_kg??null;
  let signal='';
  if(top)signal=' <span class="progress">· progressão disponível</span>';
  else if(below)signal=' <span class="warning">· carga talvez alta</span>';
  const result={text:`Último: ${weight??'—'} kg · ${sets.map(x=>x.reps).join(' / ')}${signal}`,weight,sessionId:latestSession,sets,top,below};setCachedLast(ex.id,variant,result);return result;
}

async function renderWorkout(c){
  c.innerHTML=`<div class="card"><div class="daybar">${state.days.map(d=>`<button class="btn secondary day ${state.day?.id===d.id?'active':''}" data-day="${d.id}">${workoutLetter(d)}</button>`).join('')}</div></div><div id="w"></div>`;
  document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{const next=state.days.find(d=>d.id===b.dataset.day);if(state.session&&next?.id!==state.session.workout_day_id)return alert('Finalize o treino em andamento antes de trocar de dia.');state.day=next;renderWorkout(c)});
  const w=document.getElementById('w');
  if(!state.day){w.innerHTML='<div class="card">Nenhum treino configurado.</div>';return}
  const pendingHistory=[];
  const renderedDayId=state.day.id;
  let h=`<div class="card"><div class="small muted">${esc(state.day.focus||'')}</div><h2>${esc(workoutDisplayTitle(state.day))}</h2>${state.session?`<div class="status">Treino em andamento · <span id="workoutElapsed">${duration(state.session.started_at,null)}</span></div>`:''}<button id="start" class="btn" style="width:100%">${state.session?'Treino iniciado':'Iniciar treino'}</button>`;
  for(const ex of state.day.workout_exercises){
    const vars=(ex.workout_exercise_variants||[]).sort((a,b)=>a.sort_order-b.sort_order);
    const chosen=selectedVariant(ex);
    const variantId=chosen?.id||null;
    const last=getCachedLast(ex.id,variantId)||{text:'Carregando histórico…',weight:null,top:false,below:false};
    pendingHistory.push({ex,variantId});
    h+=`<div class="exercise" data-ex="${ex.id}"><div class="exercise-head row between"><div><h3>${esc(ex.name)}</h3><div class="small muted">${ex.working_sets} × ${ex.rep_min}–${ex.rep_max} · descanso ${fmt(ex.rest_seconds)}</div></div><div class="row"><span class="exercise-count tiny muted">0/${ex.working_sets}</span>${ex.is_secondary?'<span class="tag">secundário</span>':''}<button class="collapseExercise btn ghost" type="button">−</button></div></div><div class="exercise-body">`;
    if(vars.length)h+=`<div class="field"><label class="small muted">Variação</label><select class="variant">${vars.map(v=>`<option value="${v.id}" ${v.id===chosen?.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select></div>`;
    h+=`<div class="small muted last">${last.text}</div><div class="progress nextProgress">${last.top?'Na próxima sessão, considere subir a carga e voltar para a parte baixa da faixa.':''}</div>`;
    for(let i=1;i<=ex.working_sets;i++){
      h+=`<div class="setcard" data-set="${i}"><div class="setrow"><b>${i}ª</b><div class="field"><label class="small muted">kg</label><input class="kg" inputmode="decimal" value="${last.weight??''}"></div><div class="field"><label class="small muted">reps</label><input class="reps" inputmode="numeric"></div><div class="field"><label class="small muted">RIR</label><select class="rir"><option value="">?</option><option>3</option><option>2</option><option>1</option><option>0</option></select></div></div><div class="setactions row between"><label class="row small muted"><input class="poor" type="checkbox"> Execução comprometida</label><button class="btn secondary saveSet" type="button">Concluir série</button></div></div>`;
    }
    h+=`</div></div>`;
  }
  h+=`<div class="section-title"><h3>Cardio pós-treino</h3><div class="cardio-grid"><div class="field wide"><label class="small muted">Modalidade</label><select id="cardioMod"><option>Esteira</option><option>Bicicleta</option><option>Elíptico</option><option>Escada</option><option>Outro</option></select></div><div class="field"><label class="small muted">Minutos</label><input id="cardioMin" inputmode="numeric" placeholder="0"></div><div class="field"><label class="small muted">Intensidade</label><select id="cardioInt"><option value="leve">Leve</option><option value="moderado" selected>Moderado</option><option value="intenso">Intenso</option></select></div></div></div><button id="finish" class="btn" style="width:100%;margin-top:16px">Finalizar treino</button></div>`;
  w.innerHTML=h;
  document.getElementById('start').onclick=startSession;
  document.getElementById('finish').onclick=finishSession;
  if(state.session)startWorkoutClock();
  document.querySelectorAll('.setcard').forEach(card=>{
    restoreDraft(card);
    card.querySelectorAll('input,select').forEach(input=>{input.addEventListener('input',()=>saveDraft(card));input.addEventListener('change',()=>saveDraft(card))});
    card.querySelector('.saveSet').onclick=()=>saveSet(card);
  });
  document.querySelectorAll('.variant').forEach(sel=>sel.onchange=()=>updateVariant(sel.closest('.exercise')));
  document.querySelectorAll('.collapseExercise').forEach(btn=>btn.onclick=()=>{const exEl=btn.closest('.exercise');exEl.classList.toggle('collapsed');btn.textContent=exEl.classList.contains('collapsed')?'+':'−'});
  if(state.session)loadCurrentSessionSets(renderedDayId);

  Promise.all(pendingHistory.map(async ({ex,variantId})=>({ex,variantId,last:await lastFor(ex,variantId)}))).then(items=>{
    if(state.day?.id!==renderedDayId)return;
    for(const {ex,variantId,last} of items){
      const el=document.querySelector(`.exercise[data-ex="${ex.id}"]`);
      if(!el)continue;
      const selected=el.querySelector('.variant')?.value||null;
      if(selected!==variantId)continue;
      const lastEl=el.querySelector('.last');if(lastEl)lastEl.innerHTML=last.text;
      const progressEl=el.querySelector('.nextProgress');if(progressEl)progressEl.textContent=last.suggestion|| (last.top?'Na próxima sessão, considere subir a carga e voltar para a parte baixa da faixa.':'');
      if(last.weight!=null)el.querySelectorAll('.setcard:not(.done) .kg').forEach(input=>{if(!input.value)input.value=last.weight});
    }
  }).catch(console.error);
}

async function loadCurrentSessionSets(renderedDayId){
  if(!state.session)return;
  const {data=[]}=await sb.from('workout_set_logs').select('*').eq('session_id',state.session.id);
  if(state.day?.id!==renderedDayId)return;
  for(const ex of state.day.workout_exercises){
    const el=document.querySelector(`.exercise[data-ex="${ex.id}"]`);
    if(!el)continue;
    for(const log of data.filter(x=>x.exercise_id===ex.id)){
      const card=el.querySelector(`.setcard[data-set="${log.set_number}"]`);
      if(!card)continue;
      card.querySelector('.kg').value=log.weight_kg??'';
      card.querySelector('.reps').value=log.reps??'';
      card.querySelector('.rir').value=log.rir??'';
      card.querySelector('.poor').checked=log.technique_status==='poor';
      markSetDone(card);
    }
    updateExerciseProgress(el,ex);
  }
}

async function startSession(rerender=true){
  if(state.session)return;
  const {data:open,error:openError}=await sb.from('workout_sessions').select('*')
    .eq('user_id',state.user.id).is('ended_at',null)
    .order('started_at',{ascending:false}).limit(1).maybeSingle();
  if(openError)return alert(openError.message);
  if(open){
    state.session=open;
    const d=state.days.find(x=>x.id===open.workout_day_id);
    if(d)state.day=d;
    if(rerender)render();
    return state.session;
  }
  const {data,error}=await sb.from('workout_sessions').insert({user_id:state.user.id,workout_day_id:state.day.id}).select().single();
  if(error)return alert(error.message);
  state.session=data;if(rerender)render();return data;
}

async function saveSet(card){
  if(!state.session)await startSession(false);
  if(!state.session)return;
  const el=card.closest('.exercise');
  const ex=state.day.workout_exercises.find(x=>x.id===el.dataset.ex);
  const reps=num(card.querySelector('.reps').value);
  if(reps==null||reps<0)return alert('Informe as repetições válidas.');
  const payload={
    session_id:state.session.id,
    exercise_id:ex.id,
    set_number:Number(card.dataset.set),
    weight_kg:num(card.querySelector('.kg').value),
    reps,
    rir:num(card.querySelector('.rir').value),
    technique_status:card.querySelector('.poor').checked?'poor':'normal',
    variant_id:el.querySelector('.variant')?.value||null
  };
  const {error}=await sb.from('workout_set_logs').upsert(payload,{onConflict:'session_id,exercise_id,set_number'});
  if(error)return alert(error.message);
  markSetDone(card);
  updateExerciseProgress(el,ex);
  if(state.settings.auto_rest!==false)startTimer(ex.rest_seconds,{exercise:ex.name,setNumber:Number(card.dataset.set),nextSet:Number(card.dataset.set)+1,total:ex.working_sets});
}

async function updateVariant(el){
  const ex=state.day.workout_exercises.find(x=>x.id===el.dataset.ex);
  const v=el.querySelector('.variant').value;
  state.variants[ex.id]=v;localStorage.setItem(variantKey(ex.id),v);
  const last=await lastFor(ex,v);
  el.querySelector('.last').innerHTML=last.text;
  const progressEl=el.querySelector('.nextProgress');if(progressEl)progressEl.textContent=last.top?'Na próxima sessão, considere subir a carga e voltar para a parte baixa da faixa.':'';
  el.querySelectorAll('.kg').forEach(i=>i.value=last.weight??'');
}

async function finishSession(){
  if(!state.session)return alert('Inicie o treino primeiro.');
  const finishingId=state.session.id;
  const minutes=num(document.getElementById('cardioMin')?.value);
  if(minutes&&minutes>0){
    const {error:cardioError}=await sb.from('workout_cardio_logs').insert({
      session_id:finishingId,
      modality:document.getElementById('cardioMod').value,
      duration_minutes:Math.round(minutes),
      intensity:document.getElementById('cardioInt').value
    });
    if(cardioError)return alert(cardioError.message);
  }

  const endedAt=new Date().toISOString();
  const {data:closed,error}=await sb.from('workout_sessions')
    .update({ended_at:endedAt})
    .eq('id',finishingId)
    .eq('user_id',state.user.id)
    .is('ended_at',null)
    .select('id,ended_at')
    .maybeSingle();

  if(error)return alert(error.message);
  if(!closed){
    const {data:check,error:checkError}=await sb.from('workout_sessions').select('id,ended_at').eq('id',finishingId).maybeSingle();
    if(checkError||!check?.ended_at)return alert('Não consegui confirmar o encerramento do treino. Tente novamente.');
  }

  state.session=null;
  stopTimer();
  stopWorkoutClock();
  alert('Treino finalizado e salvo.');
  render();
}

function startWorkoutClock(){
  stopWorkoutClock();
  const tick=()=>{
    const el=document.getElementById('workoutElapsed');
    if(!el||!state.session){stopWorkoutClock();return}
    el.textContent=duration(state.session.started_at,null);
  };
  tick();
  state.workoutClock=setInterval(tick,1000);
}
function stopWorkoutClock(){
  if(state.workoutClock)clearInterval(state.workoutClock);
  state.workoutClock=null;
}

function startTimer(sec){
  stopTimer();
  state.paused=false;
  state.restPausedRemainingMs=null;
  state.restEndAt=Date.now()+sec*1000;
  state.left=sec;
  timerBox.classList.remove('hidden');
  scheduleRestPush(state.restEndAt);
  drawTimer();
  tickRestTimer();
  state.timer=setInterval(tickRestTimer,500);
}
function tickRestTimer(){
  if(state.paused||!state.restEndAt)return;
  const remaining=state.restEndAt-Date.now();
  if(remaining<=0){
    finishRestTimer();
    return;
  }
  const left=Math.ceil(remaining/1000);
  if(left!==state.left){
    state.left=left;
    drawTimer();
  }
}
function finishRestTimer(){
  if(state.timer)clearInterval(state.timer);
  state.timer=null;
  state.left=0;
  state.restEndAt=null;
  state.restPausedRemainingMs=null;
  state.restNotificationId=null;
  state.paused=false;
  timerBox.classList.add('hidden');
  if(state.settings.vibration_enabled&&navigator.vibrate)navigator.vibrate([180,100,180,100,180]);
  beep();
}
function drawTimer(){
  timerBox.innerHTML=`<div class="row between"><div><div class="small muted">DESCANSO</div><div class="time">${fmt(Math.max(0,state.left))}</div></div><button id="skip" class="btn secondary">Pular</button></div><div class="row" style="margin-top:8px"><button id="plus" class="btn secondary">+30 s</button><button id="pause" class="btn secondary">${state.paused?'Continuar':'Pausar'}</button></div>`;
  document.getElementById('skip').onclick=stopTimer;
  document.getElementById('plus').onclick=()=>{
    if(state.paused){
      state.restPausedRemainingMs=(state.restPausedRemainingMs??state.left*1000)+30000;
      state.left=Math.ceil(state.restPausedRemainingMs/1000);
    }else if(state.restEndAt){
      state.restEndAt+=30000;
      state.left=Math.ceil((state.restEndAt-Date.now())/1000);
      scheduleRestPush(state.restEndAt);
    }
    drawTimer();
  };
  document.getElementById('pause').onclick=()=>{
    if(!state.paused){
      state.restPausedRemainingMs=Math.max(0,(state.restEndAt??Date.now())-Date.now());
      state.restEndAt=null;
      state.paused=true;
      state.left=Math.ceil(state.restPausedRemainingMs/1000);
      cancelRestPush();
    }else{
      state.paused=false;
      state.restEndAt=Date.now()+(state.restPausedRemainingMs??state.left*1000);
      state.restPausedRemainingMs=null;
      scheduleRestPush(state.restEndAt);
    }
    drawTimer();
  };
}
function stopTimer(){
  cancelRestPush();
  if(state.timer)clearInterval(state.timer);
  state.timer=null;
  state.left=0;
  state.restEndAt=null;
  state.restPausedRemainingMs=null;
  state.paused=false;
  timerBox.classList.add('hidden');
}
function syncRestTimer(){
  if(state.timer&&!state.paused)tickRestTimer();
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncRestTimer()});
window.addEventListener('pageshow',syncRestTimer);
window.addEventListener('focus',syncRestTimer);
function beep(){
  if(!state.settings.sound_enabled)return;
  try{
    const a=new AudioContext();
    [0,.32,.64].forEach(delay=>{
      const o=a.createOscillator();
      const g=a.createGain();
      o.connect(g);g.connect(a.destination);
      o.frequency.value=880;
      g.gain.value=.08;
      const start=a.currentTime+delay;
      o.start(start);
      o.stop(start+.18);
    });
    setTimeout(()=>{try{a.close()}catch{}},1100);
  }catch{}
}

async function renderHistory(c){
  c.innerHTML='<div class="card"><h2>Histórico</h2><div id="hist" class="muted">Carregando…</div></div>';
  const {data=[]}=await sb.from('workout_sessions').select('id,started_at,ended_at,workout_days(title,focus,sort_order),workout_set_logs(id),workout_cardio_logs(duration_minutes,modality,intensity)').order('started_at',{ascending:false}).limit(30);
  document.getElementById('hist').innerHTML=data.length?data.map(x=>{
    const cardio=x.workout_cardio_logs?.[0];
    return `<div class="history-row"><div class="row between"><b>${esc(workoutDisplayTitle(x.workout_days))}</b><button class="btn secondary deleteSession" data-id="${x.id}">Excluir</button></div><div class="small muted">${new Date(x.started_at).toLocaleString('pt-BR')} · ${x.workout_set_logs?.length||0} séries · ${duration(x.started_at,x.ended_at)}</div>${cardio?`<div class="small muted">Cardio: ${esc(cardio.modality||'')} · ${cardio.duration_minutes} min · ${esc(cardio.intensity||'')}</div>`:''}</div>`
  }).join(''):'Nenhum treino registrado.';
  document.querySelectorAll('.deleteSession').forEach(btn=>btn.onclick=()=>deleteSession(btn.dataset.id));
}

async function deleteSession(id){
  if(!confirm('Excluir este treino do histórico? Séries e cardio desse treino também serão apagados.'))return;
  const {error}=await sb.from('workout_sessions').delete().eq('id',id).eq('user_id',state.user.id);
  if(error)return alert(error.message);
  if(state.session?.id===id)state.session=null;
  await renderHistory(document.getElementById('content'));
}

async function renderBody(c){
  c.innerHTML=`<div class="card"><h2>Medidas corporais</h2><p class="small muted">Abdômen = fita horizontal passando pelo centro do umbigo.</p><div class="measuregrid">${[['weight','Peso (kg)'],['abdomen','Abdômen (cm)'],['chest','Tórax (cm)'],['hip','Quadril (cm)'],['armr','Braço D (cm)'],['arml','Braço E (cm)'],['thighr','Coxa D (cm)'],['thighl','Coxa E (cm)'],['calfr','Panturrilha D (cm)'],['calfl','Panturrilha E (cm)']].map(([id,l])=>`<div class="field"><label>${l}</label><input id="${id}" inputmode="decimal"></div>`).join('')}</div><button id="saveBody" class="btn" style="width:100%;margin-top:14px">Salvar medidas</button></div><div class="card"><h3>Últimos registros</h3><div id="bodyHist" class="muted"></div></div>`;
  document.getElementById('saveBody').onclick=saveBody;
  const {data=[]}=await sb.from('workout_body_measurements').select('*').order('measured_at',{ascending:false}).limit(12);
  document.getElementById('bodyHist').innerHTML=data.length?data.map(x=>`<div class="history-row"><b>${esc(x.measured_at)}</b><div class="small">${x.weight_kg?`Peso ${x.weight_kg} kg · `:''}${x.abdomen_cm?`Abdômen ${x.abdomen_cm} cm`:''}</div><div class="tiny muted">${[x.chest_cm&&`Tórax ${x.chest_cm}`,x.hip_cm&&`Quadril ${x.hip_cm}`,x.arm_right_cm&&`Braço D ${x.arm_right_cm}`,x.thigh_right_cm&&`Coxa D ${x.thigh_right_cm}`].filter(Boolean).join(' · ')}</div></div>`).join(''):'Nenhum registro.';
}

async function saveBody(){
  const p={
    user_id:state.user.id,
    weight_kg:num(document.getElementById('weight').value),abdomen_cm:num(document.getElementById('abdomen').value),
    chest_cm:num(document.getElementById('chest').value),hip_cm:num(document.getElementById('hip').value),
    arm_right_cm:num(document.getElementById('armr').value),arm_left_cm:num(document.getElementById('arml').value),
    thigh_right_cm:num(document.getElementById('thighr').value),thigh_left_cm:num(document.getElementById('thighl').value),
    calf_right_cm:num(document.getElementById('calfr').value),calf_left_cm:num(document.getElementById('calfl').value)
  };
  const {error}=await sb.from('workout_body_measurements').insert(p);
  if(error)alert(error.message);else{alert('Medidas salvas.');renderBody(document.getElementById('content'))}
}

function renderSettings(c){
  c.innerHTML=`<div class="card"><h2>Ajustes</h2>
    <label class="row between" style="padding:10px 0"><span>Descanso automático</span><input id="auto" type="checkbox" ${state.settings.auto_rest!==false?'checked':''}></label>
    <label class="row between" style="padding:10px 0"><span>Som ao finalizar</span><input id="sound" type="checkbox" ${state.settings.sound_enabled!==false?'checked':''}></label>
    <label class="row between" style="padding:10px 0"><span>Vibração</span><input id="vib" type="checkbox" ${state.settings.vibration_enabled!==false?'checked':''}></label>
    <button id="saveCfg" class="btn secondary" style="width:100%">Salvar</button>
  </div>
  <div class="card">
    <h3>Notificação do descanso</h3>
    <p class="small muted">Com ela ativada, o Android pode avisar mesmo com a tela apagada. Se o relógio espelha as notificações do celular, o aviso também pode aparecer nele.</p>
    <div id="pushStatus" class="status">Verificando…</div>
    <button id="enablePush" class="btn" style="width:100%">Ativar notificações</button>
  </div>`;

  document.getElementById('saveCfg').onclick=async()=>{
    const p={user_id:state.user.id,auto_rest:document.getElementById('auto').checked,sound_enabled:document.getElementById('sound').checked,vibration_enabled:document.getElementById('vib').checked};
    const {error}=await sb.from('workout_user_settings').upsert(p);
    if(error)alert(error.message);else{state.settings={...state.settings,...p};alert('Configurações salvas.')}
  };

  const status=document.getElementById('pushStatus');
  const btn=document.getElementById('enablePush');

  (async()=>{
    await refreshPushCapability();
    if(state.pushEnabled){
      status.textContent='Ativadas neste aparelho';
      btn.textContent='Notificações ativas';
      btn.disabled=true;
    }else if(Notification.permission==='denied'){
      status.textContent='Bloqueadas pelo Android/Chrome. Libere a permissão de notificações para o Meu Treino.';
      btn.textContent='Notificações bloqueadas';
      btn.disabled=true;
    }else{
      status.textContent='Desativadas neste aparelho';
    }
  })();

  btn.onclick=async()=>{
    btn.disabled=true;
    btn.textContent='Ativando…';
    try{
      await enablePushNotifications();
      status.textContent='Ativadas neste aparelho';
      btn.textContent='Notificações ativas';
    }catch(e){
      status.textContent=e?.message||'Não foi possível ativar.';
      btn.textContent='Tentar novamente';
      btn.disabled=false;
    }
  };
}

boot();
