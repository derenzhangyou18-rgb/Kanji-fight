(() => {
const $=id=>document.getElementById(id), configured=window.SUPABASE_URL?.startsWith("https://")&&!window.SUPABASE_URL.includes("PASTE_")&&window.SUPABASE_ANON_KEY&&!window.SUPABASE_ANON_KEY.includes("PASTE_");
const db=configured?supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY):null;
let user=null,profile=null,character=null,termsAccepted=false,queueRoom=null,queueSub=null,battleSub=null,searchPoll=null,opponentState=null,countdownTimer=null,resultTimer=null,countdownStarted=false;
const canvas=$("arena"),ctx=canvas.getContext("2d"), keys=new Set();
let me={x:180,y:250,hp:100,face:1,guard:false,attackUntil:0,cooldown:0},op={x:710,y:250,hp:100,face:-1,guard:false,attackUntil:0},playing=false,finished=false,lastSync=0;
const show=id=>$(id).classList.remove("hidden"),hide=id=>$(id).classList.add("hidden"),alertUser=msg=>alert(msg);
function strokes(c){const map={"一":1,"二":2,"三":3,"四":5,"五":4,"六":4,"七":2,"八":2,"九":2,"十":2,"口":3,"人":2,"大":3,"小":3,"山":3,"川":3,"木":4,"水":4,"火":4,"天":4,"月":4,"日":4,"田":5,"目":5,"百":6,"千":3,"龍":16,"鬱":29};return map[c]||Math.max(2,Math.min(30,5+((c.codePointAt(0)-0x4e00)%20)));}
function calc(c){let complexity=Math.min(1,strokes(c)/24);return{attack:Math.min(50,Math.round(7+complexity*40)),defense:Math.min(50,24+((strokes(c)*7)%13)),speed:Math.min(50,Math.round(48-complexity*39))}}
function preview(){let c=$("kanji").value.trim().slice(0,1);$("glyph").textContent=c||"?";let s=c?calc(c):{attack:0,defense:0,speed:0};for(let [k,v] of [["atk",s.attack],["def",s.defense],["spd",s.speed]]){$(k).textContent=v;$(`${k}bar`).style.width=(v*2)+"%"}}
$("kanji").oninput=preview;
function esc(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function profileLoad(){const {data,error}=await db.from("profiles").select("*").eq("id",user.id).single();if(error){console.error(error);return}profile=data;character=data.kanji?{kanji:data.kanji,stats:data.stats||calc(data.kanji)}:null}
function loggedIn(){hide("auth");hide("terms");show("lobby");$("badge").textContent=profile?.username||user.email;$("welcome").textContent=`${profile?.username||"プレイヤー"} さん、ようこそ`;$("points").textContent=profile?.points||0;if(character){$("kanji").value=character.kanji;preview()}ranking();if(!termsAccepted){hide("lobby");show("terms")}}
function checkConfig(){if(!db){alertUser("config.jsにSupabase URLとanon keyを設定してください。");return false}return true}
$("signup").onclick=async()=>{if(!checkConfig())return;let username=$("username").value.trim(),email=$("email").value.trim(),password=$("password").value;if(!username||!email||password.length<6){alertUser("ユーザー名・メール・6文字以上のパスワードを入力してください。");return}let {error}=await db.auth.signUp({email,password,options:{data:{username}}});if(error)alertUser(error.message);else alertUser("登録しました。メール確認が必要な設定の場合は、メールを確認してからログインしてください。")};
$("login").onclick=async()=>{if(!checkConfig())return;let {data,error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error){alertUser(error.message);return}user=data.user;await profileLoad();termsAccepted=false;loggedIn()};
$("agree").onchange=()=>{$("continue").disabled=!$("agree").checked};
$("continue").onclick=()=>{termsAccepted=true;hide("terms");show("lobby")};
$("logout").onclick=async()=>{await db.auth.signOut();user=null;profile=null;character=null;hide("lobby");hide("terms");show("auth");$("badge").textContent="未ログイン"};
$("save").onclick=async()=>{let c=$("kanji").value.trim().slice(0,1);if(!c){alertUser("漢字を1文字入力してください");return}let s=calc(c),{data,error}=await db.from("profiles").upsert({id:user.id,username:profile?.username||user.email,kanji:c,stats:s},{onConflict:"id"}).eq("id",user.id).select().single();if(error)alertUser(error.message);else{profile=data;character={kanji:c,stats:s};alertUser("保存しました")}};
async function ranking(){if(!db)return;let {data,error}=await db.from("profiles").select("username,points,kanji").order("points",{ascending:false}).limit(30);if(error){$("ranklist").textContent="ランキング取得失敗";return}$("ranklist").innerHTML=(data||[]).map((r,i)=>`<div class="rank"><span>${i+1}. ${esc(r.username)} ${esc(r.kanji||"")}</span><b>${r.points||0} P</b></div>`).join("")||"まだランキングがありません"}
$("match").onclick=async()=>{if(!user||!character){alertUser("ログインし、漢字を保存してください");return}if(!checkConfig())return;$("match").disabled=true;show("cancel");$("matchstatus").textContent="相手を探しています…";let {data,error}=await db.rpc("find_or_create_match",{p_kanji:character.kanji,p_stats:character.stats});if(error){$("matchstatus").textContent=error.message;$("match").disabled=false;hide("cancel");return}queueRoom=data;let id=data.room_id;queueSub=db.channel("queue-"+id).on("postgres_changes",{event:"*",schema:"public",table:"match_queue",filter:`room_id=eq.${id}`},ev=>{if(ev.new?.status==="matched"||ev.new?.player2_id)beginMatch(ev.new)}).subscribe();let tries=0;searchPoll=setInterval(async()=>{let q=await db.from("match_queue").select("*").eq("room_id",id).maybeSingle();if(q.data&&(q.data.status==="matched"||q.data.player2_id)){clearInterval(searchPoll);beginMatch(q.data)}if(++tries>120){clearInterval(searchPoll);$("matchstatus").textContent="検索時間切れ。再試行してください";cancelQueue()}},1300)};
function beginMatch(r){
  clearInterval(searchPoll);
  queueRoom=r;
  $("matchstatus").textContent="対戦相手が見つかりました！";
  $("match").textContent="試合開始";
  $("match").disabled=false;
  countdownStarted=false;
  $("match").onclick=async()=>{
    $("match").disabled=true;
    $("matchstatus").textContent="開始準備を送信中…";
    const res=await db.rpc("start_match_room",{p_room_id:r.room_id});
    if(res.error){
      $("matchstatus").textContent="エラー："+res.error.message;
      $("match").disabled=false;
      return;
    }
    $("matchstatus").textContent=(res.data?.status==="started")?"両者準備完了！":"相手の開始待ち…";
    if(searchPoll)clearInterval(searchPoll);
    searchPoll=setInterval(async()=>{
      const q=await db.from("match_queue").select("*").eq("room_id",r.room_id).maybeSingle();
      if(q.error){$("matchstatus").textContent="相手の開始待ち…";return}
      if(q.data?.status==="started"&&!countdownStarted){
        countdownStarted=true;
        clearInterval(searchPoll);
        searchPoll=null;
        beginCountdown(q.data);
      }else if(q.data?.status==="finished"||q.data?.status==="cancelled"){
        clearInterval(searchPoll);searchPoll=null;
        $("matchstatus").textContent="対戦が終了またはキャンセルされました";
        $("match").disabled=false;
      }else{
        $("matchstatus").textContent="相手の開始待ち…";
      }
    },650);
  };
}
function beginCountdown(r){
  if(countdownTimer)clearInterval(countdownTimer);
  hide("lobby");show("battle");
  $("battlemsg").textContent="試合開始まで 3";
  let count=3;
  countdownTimer=setInterval(()=>{
    count--;
    if(count>0){
      $("battlemsg").textContent="試合開始まで "+count;
    }else{
      clearInterval(countdownTimer);countdownTimer=null;
      startBattle(r);
    }
  },1000);
}
async function cancelQueue(){
  if(searchPoll){clearInterval(searchPoll);searchPoll=null}
  if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null}
  if(queueRoom)await db.rpc("cancel_match_room",{p_room_id:queueRoom.room_id});
  if(queueSub){db.removeChannel(queueSub);queueSub=null}
  queueRoom=null;countdownStarted=false;
  $("match").textContent="対戦相手を探す";$("match").onclick=queueAgain;$("match").disabled=false;
  hide("cancel");$("matchstatus").textContent="キャンセルしました"
}
async function queueAgain(){ $("match").onclick=queueMatchHandler; queueMatchHandler()}
const queueMatchHandler=$("match").onclick;
$("cancel").onclick=cancelQueue;
function startBattle(r){hide("lobby");show("battle");playing=true;finished=false;me={x:180,y:250,hp:100,face:1,guard:false,attackUntil:0,cooldown:0};op={x:710,y:250,hp:100,face:-1,guard:false,attackUntil:0};opponentState=null;keys.clear();$("mykanji").textContent=character.kanji;$("enemykanji").textContent=r.player1_id===user.id?(r.player2_kanji||"敵"):(r.player1_kanji||"敵");$("battlemsg").textContent="リアルタイム対戦開始！";if(battleSub)db.removeChannel(battleSub);battleSub=db.channel("battle-"+r.room_id).on("broadcast",{event:"state"},({payload})=>{if(payload.uid!==user.id){opponentState=payload;op.x=payload.x;op.y=payload.y;op.hp=payload.hp;op.guard=payload.guard;op.face=payload.face;$("enemykanji").textContent=payload.kanji||$("enemykanji").textContent}}).on("broadcast",{event:"attack"},({payload})=>{if(payload.uid!==user.id){const dist=Math.hypot(me.x-payload.x,me.y-payload.y);if(dist<85){let damage=Math.max(3,Math.round(12+payload.attack*.3-(character.stats.defense*.2)));me.hp=Math.max(0,me.hp-(me.guard?Math.ceil(damage*.3):damage));if(me.hp<=0)finish(false)}}}).subscribe();requestAnimationFrame(frame)}
function sync(){if(!battleSub)return;if(Date.now()-lastSync<45)return;lastSync=Date.now();battleSub.send({type:"broadcast",event:"state",payload:{uid:user.id,x:me.x,y:me.y,hp:me.hp,guard:me.guard,face:me.face,kanji:character.kanji}})}
function attack(){if(!playing||finished||Date.now()<me.cooldown)return;me.attackUntil=Date.now()+160;me.cooldown=Date.now()+550;let atk=character.stats.attack;battleSub?.send({type:"broadcast",event:"attack",payload:{uid:user.id,x:me.x,y:me.y,face:me.face,attack:atk}});let distance=Math.hypot(op.x-me.x,op.y-me.y),facing=(op.x-me.x)*me.face>0;if(distance<90&&facing){let damage=Math.max(5,Math.round(10+atk*.5-character.stats.defense*.15));op.hp=Math.max(0,op.hp-damage);$("battlemsg").textContent=`攻撃ヒット！ ${damage} ダメージ`;if(op.hp<=0)finish(true)}}
function guardOn(v){me.guard=v}
$("hit").onclick=attack;$("guard").onpointerdown=()=>guardOn(true);["pointerup","pointerleave","pointercancel"].forEach(e=>$("guard").addEventListener(e,()=>guardOn(false)));
const directionKeys={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right"};
window.addEventListener("keydown",e=>{if(directionKeys[e.key]&&playing){e.preventDefault();keys.add(directionKeys[e.key])}if(e.code==="Space"){e.preventDefault();attack()}if(e.key==="Shift")guardOn(true)});
window.addEventListener("keyup",e=>{if(directionKeys[e.key])keys.delete(directionKeys[e.key]);if(e.key==="Shift")guardOn(false)});window.addEventListener("blur",()=>{keys.clear();guardOn(false)});
document.querySelectorAll("[data-dir]").forEach(b=>{let d=b.dataset.dir;b.onpointerdown=e=>{e.preventDefault();keys.add(d)};["pointerup","pointerleave","pointercancel"].forEach(ev=>b.addEventListener(ev,()=>keys.delete(d)))});
function frame(){if(!playing)return;if(!finished){let s=character.stats,speed=85+s.speed*3.8,dt=1/60,vx=0,vy=0;if(keys.has("left"))vx--;if(keys.has("right"))vx++;if(keys.has("up"))vy--;if(keys.has("down"))vy++;let norm=Math.hypot(vx,vy)||1;if(vx)me.face=Math.sign(vx);let slow=me.guard ? 0.45 : 1;me.x=Math.max(32,Math.min(canvas.width-32,me.x+vx/norm*speed*dt*slow));me.y=Math.max(50,Math.min(canvas.height-32,me.y+vy/norm*speed*dt*slow));if(!opponentState){op.x+=(me.x-op.x)*.002;op.y+=(me.y-op.y)*.002}sync()}render();hud();requestAnimationFrame(frame)}
function render(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#101722";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle="#263548";for(let x=0;x<canvas.width;x+=45){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke()}for(let y=0;y<canvas.height;y+=45){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke()}ctx.strokeStyle="#485975";ctx.lineWidth=3;ctx.strokeRect(16,16,canvas.width-32,canvas.height-32);fighter(me,character?.kanji||"字",false);fighter(op,$("enemykanji").textContent,true)}
function fighter(p,k,enemy){ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle="#0005";ctx.beginPath();ctx.ellipse(0,24,25,8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=enemy?"#ff767d":"#8296ff";ctx.strokeStyle=enemy?"#ffc1c5":"#c9d2ff";ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-22,-25,44,50,9);ctx.fill();ctx.stroke();ctx.fillStyle="#111521";ctx.font="bold 30px serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(k,0,0);if(p.guard){ctx.strokeStyle="#63c9ff";ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,36,0,Math.PI*2);ctx.stroke()}if(Date.now()<p.attackUntil){ctx.strokeStyle="#ffce86";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(p.face*22,0);ctx.lineTo(p.face*58,-10);ctx.stroke()}ctx.restore()}
function hud(){$("myhp").style.width=me.hp+"%";$("enemyhp").style.width=op.hp+"%";$("myhpnum").textContent=me.hp+" / 100";$("enemyhpnum").textContent=op.hp+" / 100"}
async function finish(win){
  if(finished)return;
  finished=true;playing=false;keys.clear();guardOn(false);
  const delta=win?"+50P":"-40P";
  $("battlemsg").textContent=win?"勝利！ +50P":"敗北 -40P";
  let {error}=await db.rpc("finish_match",{p_room_id:queueRoom.room_id,p_won:win});
  if(error)console.warn("score update failed",error);
  await profileLoad();
  $("points").textContent=profile?.points||0;
  ranking();
  showResult(win,delta);
}
function showResult(win,delta){
  if(resultTimer){clearTimeout(resultTimer);resultTimer=null}
  let overlay=document.getElementById("resultOverlay");
  if(!overlay){
    overlay=document.createElement("div");overlay.id="resultOverlay";
    Object.assign(overlay.style,{position:"fixed",inset:"0",zIndex:"9999",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",background:"rgba(7,10,16,.86)"});
    overlay.innerHTML='<div style="max-width:420px;width:100%;background:#1a202c;border:1px solid #45536c;border-radius:18px;padding:26px;text-align:center;color:#eef2fa;box-shadow:0 20px 70px #0008"><h2 id="resultTitle" style="font-size:34px;margin:8px 0"></h2><p id="resultPoints" style="font-size:24px;margin:12px 0"></p><p>5秒後にロビーへ戻ります</p><button id="resultHome" style="width:100%;margin-top:12px">ロビーに戻る</button></div>';
    document.body.appendChild(overlay);
  }
  overlay.querySelector("#resultTitle").textContent=win?"勝利！":"敗北";
  overlay.querySelector("#resultTitle").style.color=win?"#70e0aa":"#ff858d";
  overlay.querySelector("#resultPoints").textContent="ポイント "+delta;
  overlay.querySelector("#resultHome").onclick=returnHome;
  resultTimer=setTimeout(returnHome,5000);
}
function returnHome(){
  if(resultTimer){clearTimeout(resultTimer);resultTimer=null}
  if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null}
  if(searchPoll){clearInterval(searchPoll);searchPoll=null}
  playing=false;finished=true;keys.clear();guardOn(false);
  if(battleSub){db.removeChannel(battleSub);battleSub=null}
  if(queueSub){db.removeChannel(queueSub);queueSub=null}
  const overlay=document.getElementById("resultOverlay");if(overlay)overlay.remove();
  hide("battle");show("lobby");
  queueRoom=null;opponentState=null;countdownStarted=false;
  $("match").textContent="対戦相手を探す";$("match").disabled=false;$("match").onclick=queueAgain;
  hide("cancel");$("matchstatus").textContent="準備完了";ranking();
}
$("leave").onclick=()=>{
  if(playing&&!finished){finish(false)}
  else{returnHome()}
};
})();
