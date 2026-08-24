const $ = id => document.getElementById(id);
let original = null;

const aliases = {
  name:['name','characterName','character_name'], player:['player','playerName','player_name','author'],
  age:['age'], sex:['sex','gender'], job:['job','occupation'], memo:['memo','setting','notes','note'],
  life:['life','hp','lifePoint','lifeCurrent','life_now'], lifeMax:['lifeMax','hpMax','lifePointMax','life_max'],
  sanity:['sanity','san','sanityCurrent','san_now'], sanityMax:['sanityMax','sanMax','sanity_max'],
  curiosity:['curiosity','curiosityName','interest'], fear:['fear','fearSkill','fearName','phobia']
};

function first(obj, keys, fallback=''){
  for(const k of keys){ if(obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]; }
  return fallback;
}
function arr(obj,...keys){ for(const k of keys){ if(Array.isArray(obj?.[k])) return obj[k]; } return []; }
function esc(v){ return String(v ?? '').trim(); }
function num(v, fallback=0){ const n=Number(v); return Number.isFinite(n)?n:fallback; }

function extractKey(url){
  try { return new URL(url).searchParams.get('key') || ''; }
  catch { return ''; }
}

async function fetchSheet(url){
  const key = extractKey(url);
  if(!key) throw new Error('URLから key=... を取得できませんでした。共有URLを確認してください。');
  const endpoint = `https://character-sheets.appspot.com/insane/display?ajax=1&key=${encodeURIComponent(key)}`;
  const res = await fetch(endpoint, {mode:'cors', credentials:'omit'});
  if(!res.ok) throw new Error(`キャラクターシート取得に失敗しました (${res.status})`);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch {
    // JSONP風レスポンスにも軽く対応
    const m = text.match(/^[^(]+\((.*)\);?\s*$/s);
    if(m) return JSON.parse(m[1]);
    throw new Error('取得結果をJSONとして解析できませんでした。');
  }
}

function normalize(raw, sourceUrl=''){
  // APIが {data:{...}} を返すケースも吸収
  const d = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  const get = k => esc(first(d, aliases[k], ''));

  // キャラクターシート倉庫でありがちな配列/連番形式を広めに拾う
  const skills = arr(d,'skills','skill','learnedSkills','learned_skills','skillList')
    .map(x => typeof x === 'string' ? x : first(x,['name','skill','label','title']))
    .filter(Boolean);
  const abilities = arr(d,'abilities','ability','abilityList','ability_list')
    .map(x => typeof x === 'string' ? {name:x} : ({name:first(x,['name','ability','title']), type:first(x,['type']), skill:first(x,['skill','targetSkill','target_skill']), effect:first(x,['effect','description'])}))
    .filter(x=>x.name);

  // skill1, skill2 ... / ability1 ... のような平坦形式も拾う
  for(const [k,v] of Object.entries(d||{})){
    if(/^skill\d+$/i.test(k) && v) skills.push(typeof v==='string'?v:(v.name||v.skill||''));
  }
  const uniqSkills=[...new Set(skills.map(esc).filter(Boolean))];

  let life = get('life'), lifeMax = get('lifeMax'), sanity = get('sanity'), sanityMax = get('sanityMax');
  // 倉庫系で最大値/現在値が別名の場合を追加吸収
  lifeMax ||= esc(first(d,['life_max','lifeMaximum','maxLife','hitpointMax'],6));
  life ||= esc(first(d,['life_now','lifeCurrent','currentLife','hitpoint'],lifeMax||6));
  sanityMax ||= esc(first(d,['sanity_max','sanityMaximum','maxSanity'],6));
  sanity ||= esc(first(d,['sanity_now','sanityCurrent','currentSanity'],sanityMax||6));

  return {
    name:get('name'), player:get('player'), age:get('age'), sex:get('sex'), job:get('job'), memo:get('memo'),
    life:num(life,6), lifeMax:num(lifeMax,6), sanity:num(sanity,6), sanityMax:num(sanityMax,6),
    curiosity:get('curiosity'), fear:get('fear'), skills:uniqSkills, abilities, sourceUrl
  };
}

function makeCommands(c){
  const out=[];
  out.push('2D6>=5 【基本判定】');
  out.push('');
  out.push('//生命力');
  out.push('//正気度');
  if($('includeSkills').checked && c.skills.length){
    out.push('','### 習得特技');
    c.skills.forEach(s=>out.push(`2D6>=5 《${s}》`));
  }
  if($('includeAbilities').checked && c.abilities.length){
    out.push('','### アビリティ');
    c.abilities.forEach(a=>out.push(`【${a.name}】${a.skill?` 指定特技：《${a.skill}》`:''}`));
  }
  return out.join('\n');
}

function populate(c){
  original = structuredClone(c);
  $('name').value=c.name; $('player').value=c.player; $('age').value=c.age; $('sex').value=c.sex; $('job').value=c.job;
  $('sourceUrl').value=c.sourceUrl; $('life').value=c.life; $('lifeMax').value=c.lifeMax; $('sanity').value=c.sanity; $('sanityMax').value=c.sanityMax;
  $('curiosity').value=c.curiosity; $('fear').value=c.fear; $('memo').value=c.memo; $('commands').value=makeCommands(c);
  $('preview').classList.remove('hidden');
}

function current(){
  return {...(original||{}), name:$('name').value,player:$('player').value,age:$('age').value,sex:$('sex').value,job:$('job').value,memo:$('memo').value,
    sourceUrl:$('sourceUrl').value,life:num($('life').value),lifeMax:num($('lifeMax').value),sanity:num($('sanity').value),sanityMax:num($('sanityMax').value),
    curiosity:$('curiosity').value,fear:$('fear').value};
}

function buildCocofolia(){
  const c=current();
  const memo=[];
  if($('includeProfile').checked){
    if(c.player) memo.push(`PL：${c.player}`);
    if(c.age) memo.push(`年齢：${c.age}`);
    if(c.sex) memo.push(`性別：${c.sex}`);
    if(c.job) memo.push(`職業：${c.job}`);
    if(memo.length) memo.push('');
  }
  if(c.memo) memo.push(c.memo);
  const params=[];
  if($('includeParams').checked){
    if(c.curiosity) params.push({label:'好奇心',value:c.curiosity});
    if(c.fear) params.push({label:'恐怖心',value:c.fear});
  }
  return {
    kind:'character',
    data:{
      name:c.name || '名称未設定',
      memo:memo.join('\n'),
      initiative:0,
      externalUrl:c.sourceUrl || '',
      status:[
        {label:'生命力',value:c.life,max:c.lifeMax},
        {label:'正気度',value:c.sanity,max:c.sanityMax}
      ],
      params,
      active:true,
      secret:false,
      invisible:false,
      hideStatus:false,
      color:'#ffffff',
      commands:$('commands').value || ''
    }
  };
}

function setStatus(msg,kind=''){
  $('status').textContent=msg; $('status').className='status'+(kind?` ${kind}`:'');
}

$('loadBtn').addEventListener('click', async()=>{
  const url=$('sheetUrl').value.trim();
  if(!url){setStatus('キャラクターシートURLを入力してください。','err');return;}
  setStatus('キャラクターシートを読み込んでいます…');
  try{
    const raw=await fetchSheet(url);
    const c=normalize(raw,url);
    populate(c);
    setStatus(`「${c.name||'名称未設定'}」を読み込みました。`,'ok');
  }catch(e){
    setStatus(`${e.message} 下の「JSONから読み込む」も利用できます。`,'err');
  }
});

$('loadJsonBtn').addEventListener('click',()=>{
  try{
    const raw=JSON.parse($('rawJson').value);
    const c=normalize(raw,$('sheetUrl').value.trim());
    populate(c); setStatus(`「${c.name||'名称未設定'}」をJSONから読み込みました。`,'ok');
  }catch(e){setStatus(`JSONの解析に失敗しました：${e.message}`,'err');}
});

$('resetBtn').addEventListener('click',()=>{ if(original) populate(original); });
['includeSkills','includeAbilities'].forEach(id=>$(id).addEventListener('change',()=>{ if(original) $('commands').value=makeCommands(original); }));

$('copyBtn').addEventListener('click',async()=>{
  const text=JSON.stringify(buildCocofolia());
  try{ await navigator.clipboard.writeText(text); setStatus('ココフォリア用データをコピーしました。ココフォリアの盤面で Ctrl+V してください。','ok'); }
  catch{ $('jsonOut').textContent=text; $('jsonOut').classList.remove('hidden'); setStatus('自動コピーできなかったためJSONを表示しました。全文をコピーしてください。','err'); }
});
$('showBtn').addEventListener('click',()=>{ $('jsonOut').textContent=JSON.stringify(buildCocofolia(),null,2); $('jsonOut').classList.toggle('hidden'); });
