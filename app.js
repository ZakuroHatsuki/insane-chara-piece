const $ = id => document.getElementById(id);
let original = null;

function esc(v){ return String(v ?? '').trim(); }
function num(v, fallback=0){ const n=Number(v); return Number.isFinite(n)?n:fallback; }
function first(obj, keys, fallback=''){
  for(const k of keys){ if(obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]; }
  return fallback;
}
function extractKey(url){
  try { return new URL(url).searchParams.get('key') || ''; }
  catch { const m=String(url).match(/[?&]key=([^&#]+)/); return m?decodeURIComponent(m[1]):''; }
}

// キャラクターシート倉庫は callback= を指定するとJSONPで返せるため、
// fetch/CORSではなくscriptタグ経由で取得する。
function fetchSheet(url){
  return new Promise((resolve,reject)=>{
    const key=extractKey(url);
    if(!key){ reject(new Error('URLから key=... を取得できませんでした。')); return; }
    const cb='__insaneSheetCb_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const script=document.createElement('script');
    const timer=setTimeout(()=>cleanup(new Error('読み込みがタイムアウトしました。')),15000);
    function cleanup(err,data){
      clearTimeout(timer); try{delete window[cb];}catch{} script.remove();
      err?reject(err):resolve(data);
    }
    window[cb]=data=>cleanup(null,data);
    script.onerror=()=>cleanup(new Error('キャラクターシート倉庫からデータを取得できませんでした。'));
    script.src=`https://character-sheets.appspot.com/insane/display?ajax=1&key=${encodeURIComponent(key)}&callback=${encodeURIComponent(cb)}`;
    document.head.appendChild(script);
  });
}

function arrayFromIndexed(d, prefixes, fields=['name']){
  const out=[];
  for(const [k,v] of Object.entries(d||{})){
    if(prefixes.some(p=>new RegExp('^'+p+'\\d+$','i').test(k)) && v){
      if(typeof v==='string') out.push(v);
      else out.push(first(v,fields,''));
    }
  }
  return out.filter(Boolean);
}
function findSkillNames(d){
  const out=[];
  for(const key of ['skills','skill','learnedSkills','learned_skills','skillList','learned']){
    const a=d?.[key]; if(!Array.isArray(a)) continue;
    for(const x of a){
      if(typeof x==='string') out.push(x);
      else if(x && (x.checked===undefined || x.checked || x.learned || x.selected)) out.push(first(x,['name','skill','label','title'],''));
    }
  }
  out.push(...arrayFromIndexed(d,['skill','learnedskill'],['name','skill','label']));
  // 倉庫のチェックボックス由来の平坦データも広く拾う
  for(const [k,v] of Object.entries(d||{})){
    if(/skill|tokugi/i.test(k) && typeof v==='string' && v && !/^\d+$/.test(v) && v.length<30) out.push(v);
  }
  return [...new Set(out.map(esc).filter(Boolean))];
}
function findAbilities(d){
  const out=[];
  for(const key of ['abilities','ability','abilityList','ability_list']){
    const a=d?.[key]; if(!Array.isArray(a)) continue;
    for(const x of a){
      if(typeof x==='string') out.push({name:x});
      else if(x) out.push({name:first(x,['name','ability','title']),type:first(x,['type']),skill:first(x,['skill','targetSkill','target_skill']),effect:first(x,['effect','description'])});
    }
  }
  // ability1Name / ability1Skill のような形式をまとめる
  const buckets={};
  for(const [k,v] of Object.entries(d||{})){
    let m=k.match(/^(?:ability|abilitys|abi)(\d+)(?:_)?(name|skill|type|effect)?$/i);
    if(!m) continue; const i=m[1], f=(m[2]||'name').toLowerCase(); (buckets[i]??={})[f]=v;
  }
  for(const b of Object.values(buckets)) if(b.name) out.push({name:esc(b.name),skill:esc(b.skill),type:esc(b.type),effect:esc(b.effect)});
  return out.filter(x=>x.name);
}

function normalize(raw, sourceUrl=''){
  const d=(raw?.data && typeof raw.data==='object')?raw.data:raw;
  // キャラクターシート倉庫の世代差を吸収する候補名
  const name=esc(first(d,['name','characterName','character_name','pc_name']));
  const player=esc(first(d,['player','playerName','player_name','author','pl']));
  const age=esc(first(d,['age'])), sex=esc(first(d,['sex','gender'])), job=esc(first(d,['job','occupation','works']));
  const memo=esc(first(d,['memo','setting','notes','note','baseMemo','profile']));
  const lifeMax=esc(first(d,['lifeMax','life_max','lifeMaximum','maxLife','hitpointMax','hitpoint_max','hpMax','hp_max'],6));
  const life=esc(first(d,['life','lifeNow','life_now','lifeCurrent','currentLife','hitpoint','hp'],lifeMax||6));
  const sanityMax=esc(first(d,['sanityMax','sanity_max','sanityMaximum','maxSanity','sanMax','san_max'],6));
  const sanity=esc(first(d,['sanity','sanityNow','sanity_now','sanityCurrent','currentSanity','san'],sanityMax||6));
  const curiosity=esc(first(d,['curiosity','curiosityName','interest','curious']));
  const fear=esc(first(d,['fear','fearSkill','fearName','phobia','fear_skill']));
  return {name,player,age,sex,job,memo,life:num(life,6),lifeMax:num(lifeMax,6),sanity:num(sanity,6),sanityMax:num(sanityMax,6),curiosity,fear,skills:findSkillNames(d),abilities:findAbilities(d),sourceUrl};
}

function makeCommands(c){
  const out=['2D6>=5 【基本判定】','','//生命力','//正気度'];
  if($('includeSkills').checked && c.skills.length){ out.push('','### 習得特技'); c.skills.forEach(s=>out.push(`2D6>=5 《${s}》`)); }
  if($('includeAbilities').checked && c.abilities.length){ out.push('','### アビリティ'); c.abilities.forEach(a=>out.push(`【${a.name}】${a.skill?` 指定特技：《${a.skill}》`:''}`)); }
  return out.join('\n');
}
function populate(c){
  original=structuredClone(c);
  for(const id of ['name','player','age','sex','job','sourceUrl','life','lifeMax','sanity','sanityMax','curiosity','fear','memo']) $(id).value=c[id]??'';
  $('commands').value=makeCommands(c); $('preview').classList.remove('hidden');
}
function current(){ return {...(original||{}),name:$('name').value,player:$('player').value,age:$('age').value,sex:$('sex').value,job:$('job').value,memo:$('memo').value,sourceUrl:$('sourceUrl').value,life:num($('life').value),lifeMax:num($('lifeMax').value),sanity:num($('sanity').value),sanityMax:num($('sanityMax').value),curiosity:$('curiosity').value,fear:$('fear').value}; }
function buildCocofolia(){
  const c=current(), memo=[], params=[];
  if($('includeProfile').checked){ if(c.player)memo.push(`PL：${c.player}`); if(c.age)memo.push(`年齢：${c.age}`); if(c.sex)memo.push(`性別：${c.sex}`); if(c.job)memo.push(`職業：${c.job}`); if(memo.length)memo.push(''); }
  if(c.memo)memo.push(c.memo);
  if($('includeParams').checked){ if(c.curiosity)params.push({label:'好奇心',value:c.curiosity}); if(c.fear)params.push({label:'恐怖心',value:c.fear}); }
  return {kind:'character',data:{name:c.name||'名称未設定',memo:memo.join('\n'),initiative:0,externalUrl:c.sourceUrl||'',status:[{label:'生命力',value:c.life,max:c.lifeMax},{label:'正気度',value:c.sanity,max:c.sanityMax}],params,active:true,secret:false,invisible:false,hideStatus:false,color:'#ffffff',commands:$('commands').value||''}};
}
function setStatus(msg,kind=''){ $('status').textContent=msg; $('status').className='status'+(kind?` ${kind}`:''); }

$('loadBtn').addEventListener('click',async()=>{
  const url=$('sheetUrl').value.trim(); if(!url){setStatus('キャラクターシートURLを入力してください。','err');return;}
  setStatus('キャラクターシートを読み込んでいます…');
  try{ const raw=await fetchSheet(url); const c=normalize(raw,url); populate(c); setStatus(`「${c.name||'名称未設定'}」を読み込みました。`,'ok'); }
  catch(e){ setStatus(e.message,'err'); }
});
$('loadJsonBtn').addEventListener('click',()=>{ try{const raw=JSON.parse($('rawJson').value);const c=normalize(raw,$('sheetUrl').value.trim());populate(c);setStatus(`「${c.name||'名称未設定'}」をJSONから読み込みました。`,'ok');}catch(e){setStatus(`JSONの解析に失敗しました：${e.message}`,'err');} });
$('resetBtn').addEventListener('click',()=>{if(original)populate(original);});
['includeSkills','includeAbilities'].forEach(id=>$(id).addEventListener('change',()=>{if(original)$('commands').value=makeCommands(original);}));
$('copyBtn').addEventListener('click',async()=>{const text=JSON.stringify(buildCocofolia());try{await navigator.clipboard.writeText(text);setStatus('ココフォリア用データをコピーしました。ココフォリアの盤面で Ctrl+V してください。','ok');}catch{$('jsonOut').textContent=text;$('jsonOut').classList.remove('hidden');setStatus('自動コピーできなかったためJSONを表示しました。全文をコピーしてください。','err');}});
$('showBtn').addEventListener('click',()=>{$('jsonOut').textContent=JSON.stringify(buildCocofolia(),null,2);$('jsonOut').classList.toggle('hidden');});
