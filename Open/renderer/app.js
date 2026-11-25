const PIDS={0x1281:'Recovery Mode',0x1280:'Recovery Mode',0x1282:'Recovery Mode',0x1283:'Recovery Mode',0x1227:'DFU Mode',0x12a8:'Normal Mode'};
const CHIP={'7000':'A8','8000':'A9','8003':'A9','8010':'A10','8015':'A11','8020':'A12','8030':'A13','8101':'A14','8110':'A15','8120':'A16','8130':'A17 Pro'};
let DB=null;const api=async u=>{const r=await fetch(u);if(!r.ok)throw new Error('HTTP '+r.status);return r.json()};
const Engine={name:'WebUSB · iBoot recovery protocol',
 async detect(arg){
  if(!navigator.usb)throw new Error('WebUSB unavailable. Use Chrome or Edge over HTTPS (not inside an embedded frame).');
  const d=arg||await navigator.usb.requestDevice({filters:[{vendorId:0x05ac}]});
  const sn=d.serialNumber||'',f=k=>(sn.match(new RegExp(k+':([0-9A-Fa-f]+)'))||[])[1];
  const o={handle:d,source:'usb',mode:PIDS[d.productId]||'Unknown Apple mode',pid:'0x'+d.productId.toString(16),ios:'Not readable in this mode',model:'Apple device',cpid:f('CPID'),bdid:f('BDID'),ecid:f('ECID')};
  if(o.cpid){o.chip=CHIP[o.cpid.toLowerCase()]||'CPID '+o.cpid;o.model='Apple device ('+o.chip+')';
   try{DB=DB||await api('https://api.ipsw.me/v4/devices');const m=DB.find(x=>/^iPhone/.test(x.identifier)&&x.cpid==parseInt(o.cpid,16)&&x.bdid==parseInt(o.bdid,16));if(m){o.model=String(m.name).replace(/[<>&"'`]/g,'');o.product=String(m.identifier).replace(/[^\w,]/g,'')}}catch(e){}}
  return o},
 async cmd(d,c){await d.controlTransferOut({requestType:'vendor',recipient:'device',request:0,value:0,index:0},new TextEncoder().encode(c+'\0'))},
 async exitRecovery(){
  const d=S.dev&&S.dev.handle;if(!d)throw new Error('No device connected.');
  if(S.dev.mode==='DFU Mode')throw new Error('DFU Mode has no software exit command. Hold Volume Up, Volume Down, then the Side button until the Apple logo appears, or hold Side + Volume Down for about 10 seconds.');
  if(S.dev.mode!=='Recovery Mode')throw new Error('The device is not in Recovery Mode.');
  const gone=new Promise(r=>{const h=e=>{if(e.device===d){navigator.usb.removeEventListener('disconnect',h);r(true)}};navigator.usb.addEventListener('disconnect',h);setTimeout(()=>r(false),15000)});
  let err='',viaTool=false;try{if(window.native){const r=await native.run('irecovery',['-n']);viaTool=!r.missing;if(viaTool&&!r.ok)err=r.out}if(!viaTool){await d.open();if(d.configuration===null)await d.selectConfiguration(1);await d.claimInterface(0);await this.cmd(d,'setenv auto-boot true');await this.cmd(d,'saveenv');await this.cmd(d,'reboot')}}catch(e){err=e.message}
  if(!(await gone))throw new Error('The device did not leave Recovery Mode. '+(err||'Commands were sent but no reboot was observed.')+' On Windows the Apple driver may block WebUSB; try a different port or a force restart.');
  return true},
 async firmware(p){const j=await api('https://api.ipsw.me/v4/device/'+encodeURIComponent(p)+'?type=ipsw');const x=(j.firmwares||[]).find(f=>f.signed&&/^https:\/\//.test(f.url));return x?{version:String(x.version).replace(/[^\w. -]/g,''),buildid:String(x.buildid).replace(/\W/g,''),filesize:+x.filesize||0,url:x.url}:null}};
async function enrich(o){
 const kv=t=>Object.fromEntries((t||'').split('\n').map(l=>l.match(/^\s*([\w-]+):\s*(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim().replace(/[<>&"'`]/g,'')]));
 if(window.native){try{
  if(o.mode==='Normal Mode'){const r=await native.run('ideviceinfo',[]);if(r.ok){const k=kv(r.out);Object.assign(o,{product:k.ProductType,serial:k.SerialNumber,udid:k.UniqueDeviceID,activation:k.ActivationState,passcode:k.PasswordProtected,build:k.BuildVersion});if(k.ProductVersion)o.ios='iOS '+k.ProductVersion}}
  else{const r=await native.run('irecovery',['-q']);if(r.ok){const k=kv(r.out);o.product=k.PRODUCT||o.product;o.board=k.MODEL;o.ecid=o.ecid||k.ECID}}
 }catch(e){}}
 try{DB=DB||await api('https://api.ipsw.me/v4/devices');const m=DB.find(x=>x.identifier===o.product)||(o.cpid&&DB.find(x=>/^iPhone/.test(x.identifier)&&x.cpid==parseInt(o.cpid,16)&&x.bdid==parseInt(o.bdid,16)));if(m){o.model=m.name;o.product=m.identifier}}catch(e){}
 if(o.product&&/^Apple device/.test(o.model))o.model=o.product;
 return o}
const baseDetect=Engine.detect.bind(Engine);Engine.detect=async a=>enrich(await baseDetect(a));
let REPORT='';
async function repGo(i){
 if(![...document.querySelectorAll('.chk')].every(c=>c.checked))return toast('Please confirm every checklist item.');
 modal('<div class="spin"></div><p style="text-align:center">Running advanced diagnostics…</p>');
 const L=[],add=(s,t,d='')=>L.push({s,t,d}),d=S.dev;let fw=null;
 add(navigator.usb?'pass':'warn','USB subsystem',navigator.usb?'WebUSB available':'WebUSB unavailable');
 if(window.native){for(const t of ['idevice_id','ideviceinfo','irecovery','idevicerestore','idevicebackup2']){const r=await native.run(t,['--version']);add(r.missing?'fail':'pass','Tool '+t,r.missing?'Missing from this installation':'Installed')}}
 else add('warn','Device tools','Desktop app required for restore and backup');
 try{await api('https://api.ipsw.me/v4/devices');add('pass','Firmware service','Reachable')}catch(e){add('warn','Firmware service','Unreachable: '+e.message)}
 if(!d)add('fail','Device','No device detected. Connect by USB and unlock it.');
 else{
  add('pass','Device',d.model+' · '+d.mode);
  add(d.mode==='Normal Mode'?'pass':'warn','Operating mode',d.mode==='Normal Mode'?'iOS is running':'Device is outside iOS ('+d.mode+')');
  add(d.ecid?'pass':'warn','Identity',(d.ecid?'ECID '+d.ecid:'ECID unavailable')+(d.chip?' · chip '+d.chip:'')+(d.product?' · '+d.product:''));
  if(d.mode==='Normal Mode'&&window.native){
   add(d.activation==='Activated'?'pass':'warn','Activation',d.activation||'Unknown');
   add(d.passcode==='true'?'warn':'pass','Passcode',d.passcode==='true'?'Enabled; it may be needed during repair':'Not set');
   const b=await native.run('ideviceinfo',['-q','com.apple.mobile.battery']),m=(b.out||'').match(/BatteryCurrentCapacity:\s*(\d+)/);
   if(m)add(+m[1]<20?'fail':+m[1]<40?'warn':'pass','Battery',m[1]+'%'+(+m[1]<40?'. Charge above 40% before restoring':''));}
  if(d.product){try{fw=await Engine.firmware(d.product);add(fw?'pass':'fail','Signed firmware',fw?'iOS '+fw.version+' ('+fw.buildid+', '+(fw.filesize/1e9).toFixed(1)+' GB)':'None currently signed');
   if(fw&&d.ios&&!d.ios.includes(fw.version))add('warn','Software version',d.ios+'. Latest signed is '+fw.version)}catch(e){add('warn','Signed firmware','Lookup failed: '+e.message)}}
  else add('warn','Signed firmware','Product type unknown');}
 const bad=L.filter(x=>x.s==='fail').length,wr=L.filter(x=>x.s==='warn').length,rec=d&&d.mode==='Recovery Mode';
 REPORT=`Open diagnostic report · ${REP[i][0]} · ${new Date().toISOString()}\n`+L.map(x=>`[${x.s.toUpperCase()}] ${x.t}: ${x.d}`).join('\n');
 const ic={pass:'✔',warn:'⚠',fail:'✘'};
 modal(`<h2>${REP[i][0]}: diagnostics</h2><p class="mut">${bad?bad+' blocking issue(s)':'No blocking issues'} · ${wr} warning(s)</p><table>${L.map(x=>`<tr><td style="width:30px">${ic[x.s]}</td><td><b>${x.t}</b><br><span class="mut">${x.d}</span></td></tr>`).join('')}</table><div class="row" style="margin-top:14px">${window.native&&fw&&!bad?'<button class="btn" data-act="install:0">Update iOS</button><button class="btn dng" data-act="install:1">Erase &amp; Restore</button>':''}${rec?'<button class="btn" data-act="go:exit">Exit Recovery Mode</button>':''}${fw?`<a class="btn sec" href="${fw.url}" target="_blank" rel="noopener">Download IPSW</a>`:''}<button class="btn sec" data-act="report">Export report</button><button class="btn sec" data-act="mx2">Close</button></div>`)}
function exportReport(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([REPORT],{type:'text/plain'}));a.download='open-diagnostic-report.txt';a.click()}
navigator.usb&&navigator.usb.addEventListener('disconnect',e=>{if(S.dev&&S.dev.handle===e.device){S.dev=null;render();toast('Device disconnected')}});
const S={page:'home',dev:null,rg:0,rs:0,ex:{st:'idle',p:0}};
const I={
 home:'<path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
 enter:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 8v5m-2-2l2 2 2-2"/>',
 exit:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 13V8m-2 2l2-2 2 2"/>',
 repair:'<path d="M14.7 6.3a4 4 0 005 5L21 13 11 21 3 13l8-8z"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 3.5M12 17v.5"/>',
 usb:'<path d="M12 3v14M8 7l4-4 4 4M12 13l-5-3v3M12 15l5-3v-2"/><circle cx="7" cy="14" r="1.5"/><rect x="15" y="9" width="4" height="3"/>'
};
const ic=n=>`<svg viewBox="0 0 24 24">${I[n]}</svg>`;
const NAV=[['home','Home'],['enter','Enter Recovery Mode'],['exit','Exit Recovery Mode'],['repair','iOS System Repair'],['info','Device Information'],['settings','Settings'],['help','Help & Support']];
const $=s=>document.querySelector(s);
const toast=(m)=>{const t=document.createElement('div');t.className='toast';t.textContent=m;$('#toasts').append(t);setTimeout(()=>t.remove(),4200)};
function modal(h){$('#modal').innerHTML=`<div class="modal" data-act="mx"><div class="card fade">${h}</div></div>`}
const closeM=()=>$('#modal').innerHTML='';
const modeCls=()=>!S.dev?'':S.dev.mode==='Normal Mode'?'ok':'wr';
const pill=()=>`<span class="pill"><span class="dot ${S.dev?modeCls():'er'}"></span>${S.dev?'Connected · '+S.dev.mode:'Disconnected'}</span>`;




const REC='<rect x="126" y="150" width="48" height="32" rx="3" fill="none" stroke="#F6F3FF" stroke-width="2"/><rect x="118" y="186" width="64" height="5" rx="2" fill="#F6F3FF"/><path d="M150 196v34" stroke="#FF8A57" stroke-width="3" fill="none"/><text x="150" y="258" font-size="10" fill="#ADA6CC">Recovery screen</text>';
const APL='<circle cx="150" cy="186" r="18" fill="none" stroke="#F6F3FF" stroke-width="2.5"/><text x="150" y="230" font-size="10" fill="#ADA6CC">Apple logo: keep holding</text>';
const PREP='Install Apple Devices (Windows) or use Finder (Mac), then plug the iPhone into the computer with a data cable. Keep Open open.';
const SHOW='Release only when you see the cable-and-computer image. Open should then show "Recovery Mode" automatically.';
const FACE=[['Connect the iPhone',PREP,['cable'],''],['Press Volume Up','Press the Volume Up button once and release it quickly.',['up'],''],['Press Volume Down','Press the Volume Down button once and release it quickly.',['down'],''],['Hold the Side button','Press and hold the Side button. A power-off slider and then the Apple logo may appear. Keep holding through both.',['side'],APL],['Recovery screen',SHOW,[],REC]];
const GR=[
 {n:'Dynamic Island',k:'island',h:['up','down','side'],m:'iPhone 14 Pro and Pro Max, 15, 15 Plus, 15 Pro, 15 Pro Max, 16, 16 Plus, 16 Pro, 16 Pro Max, 17 series, iPhone Air, and newer iPhones with a Dynamic Island',s:FACE},
 {n:'Face ID notch',k:'notch',h:['up','down','side'],m:'iPhone X, XS, XS Max, XR, 11, 11 Pro, 11 Pro Max, 12 series, 13 series, 14, 14 Plus, 16e',s:FACE},
 {n:'Home button + volume',k:'home',h:['up','down','side'],m:'iPhone 8, 8 Plus, SE (2nd generation), SE (3rd generation)',s:FACE},
 {n:'iPhone 7',k:'seven',h:['side','down'],m:'iPhone 7, 7 Plus',s:[['Connect the iPhone',PREP,['cable'],''],['Hold two buttons','Press and hold the Side button and the Volume Down button at the same time.',['side','down'],''],['Keep holding','Keep holding through the power-off slider and the Apple logo.',['side','down'],APL],['Recovery screen',SHOW,[],REC]]},
 {n:'Home + Side button',k:'six',h:['home','side'],m:'iPhone 6, 6 Plus, 6s, 6s Plus',s:[['Connect the iPhone',PREP,['cable'],''],['Hold two buttons','Press and hold the Home button and the Side button at the same time.',['home','side'],''],['Keep holding','Keep holding through the power-off slider and the Apple logo.',['home','side'],APL],['Recovery screen',SHOW,[],REC]]},
 {n:'Home + Top button',k:'top',h:['home','top'],m:'iPhone SE (1st generation), 5s, 5c, 5, 4s, 4',s:[['Connect the iPhone',PREP,['cable'],''],['Hold two buttons','Press and hold the Home button and the Top button at the same time.',['home','top'],''],['Keep holding','Keep holding through the power-off slider and the Apple logo.',['home','top'],APL],['Recovery screen',SHOW,[],REC]]},
 {n:'Oldest iPhones',k:'old',h:['home','cable'],m:'iPhone 3GS, 3G, original iPhone (and older iPod touch)',s:[['Turn the iPhone off','Hold the Top (Sleep/Wake) button and slide to power off. Unplug the cable from the iPhone but keep it in the computer.',['top'],''],['Hold the Home button','Press and hold the Home button and do not let go.',['home'],''],['Plug in the cable','While still holding Home, plug the cable into the iPhone.',['home','cable'],''],['Recovery screen','Keep holding until the connect-to-iTunes image appears, then release.',['home'],REC]]}];
function groupFor(p){const m=/^iPhone(\d+),(\d+)$/.exec(p||'');if(!m)return -1;const a=+m[1],b=+m[2];
 if(a>=18)return 0;if(a===17)return b===5?1:0;if(a>=15)return 0;if(a===14)return b===6?2:1;if(a===13)return 1;if(a===12)return b===8?2:1;if(a===11)return 1;if(a===10)return b===3||b===6?1:2;if(a===9)return 3;if(a===8)return b===4?5:4;if(a===7)return 4;return a>=3?5:6}
function phoneArt(kind,hl=[],scr='',w=190){
 const face=kind==='island'||kind==='notch',tb=kind==='top'||kind==='old',on=k=>hl.includes(k),c=k=>on(k)?'#FF8A57':'#4b3f86',g=k=>on(k)?' filter="url(#gl)"':'',
 B=(k,x,y,bw,bh)=>`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="${c(k)}"${g(k)}/>`,
 T=(k,x,y,t,a)=>on(k)?`<text x="${x}" y="${y}" text-anchor="${a}" font-size="11" font-weight="700" fill="#FF8A57">${t}</text>`:'';
 const body=`<rect x="84" y="30" width="132" height="332" rx="${face?30:kind==='old'?20:24}" fill="#120b2e" stroke="#6a5aa8" stroke-width="3"/>`;
 const sc=face?`<rect x="92" y="38" width="116" height="316" rx="23" fill="url(#sc)"/>`+(kind==='island'?'<rect x="128" y="46" width="44" height="12" rx="6" fill="#05080f"/>':'<path d="M118 38h64v6a8 8 0 01-8 8h-48a8 8 0 01-8-8z" fill="#05080f"/>'):`<rect x="92" y="80" width="116" height="222" rx="3" fill="url(#sc)"/><rect x="130" y="58" width="40" height="5" rx="2.5" fill="#43397a"/><circle cx="150" cy="332" r="16" fill="none" stroke="${c('home')}" stroke-width="3"${g('home')}/>`;
 const btns=(kind==='old'?'':B('mute',78,86,6,18)+B('up',78,116,6,34)+B('down',78,158,6,34))+(tb?B('top',150,24,46,6):B('side',216,kind==='six'?112:130,6,kind==='six'?46:62))+`<rect x="138" y="362" width="24" height="10" rx="2" fill="${c('cable')}"${g('cable')}/>`;
 const lab=T('up',72,137,'Volume Up','end')+T('down',72,179,'Volume Down','end')+T('side',230,165,'Side button','start')+T('top',173,18,'Top button','middle')+T('home',176,336,'Home','start')+T('cable',150,390,'USB cable','middle');
 return`<svg viewBox="0 0 300 396" width="${w}" style="max-width:100%"><defs><filter id="gl"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="sc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a1566"/><stop offset="1" stop-color="#120a33"/></linearGradient></defs>${btns}${body}${sc}<g text-anchor="middle" fill="#F6F3FF" font-family="Manrope,sans-serif">${scr}</g>${lab}</svg>`}
const P={};

P.exit=()=>{const e=S.ex,d=S.dev,v1=!!d,v2=d&&d.mode!=='Normal Mode';
let body;
if(e.st==='run')body=`<div class="spin"></div><p style="text-align:center">Exiting Recovery Mode… ${Math.round(e.p)}%</p><div class="bar"><b style="width:${e.p}%"></b></div>`;
else if(e.st==='ok')body=`<h2 style="color:var(--ok)">Reboot observed</h2><p>The device accepted the commands and disconnected from Recovery Mode. Click Detect Device on Home to confirm it booted (the browser may ask for permission again).</p><button class="btn" data-act="go:home">Return to Dashboard</button>`;
else if(e.st==='err')body=`<h2 style="color:var(--er)">Operation not performed</h2><p>${e.msg}</p><div class="row"><button class="btn sec" data-act="exrst">Back</button><button class="btn" data-act="go:home">Return to Dashboard</button></div>`;
else body=`<table><tr><td>1. Device connection</td><td><span class="dot ${v1?'ok':'er'}"></span> ${v1?'Detected':'Not connected — use Detect Device on Home'}</td></tr><tr><td>2. Device status</td><td><span class="dot ${v2?'ok':d?'wr':'er'}"></span> ${!d?'Unknown':v2?d.mode:'Already in Normal Mode'}</td></tr><tr><td>Engine</td><td>${window.native?'Native tools + WebUSB':Engine.name}</td></tr></table><div class="row" style="margin-top:18px"><button class="btn" data-act="exitgo" ${v1&&v2?'':'disabled'}>Exit Recovery Mode</button><button class="btn sec" data-act="go:home">Return to Dashboard</button></div>`;
return`<div class="fade"><h1>Exit Recovery Mode</h1><p class="mut">If a device is stuck, you can also force-restart it manually (Volume Up, Volume Down, then hold Side until the Apple logo).</p><div class="card" style="max-width:640px">${pill()}<div style="margin-top:16px">${body}</div></div></div>`};

const REP=[
 ['Standard Repair','Fixes common iOS issues without erasing data.','Device in Normal or Recovery Mode · USB cable · ≥ 5 GB free on PC','All iPhones (iOS 12+)','Standard'],
 ['iOS Update Troubleshooting','Resolves stuck, failed or looping iOS updates.','Stable connection · charged to 20%+','iPhone 6s and later','Update'],
 ['Apple Logo Fix','Diagnoses a device stuck on the Apple logo.','Device in Recovery Mode · USB cable','All iPhones','Logo'],
 ['Boot Loop Diagnosis','Guided checks for devices restarting repeatedly.','Charging 30+ min · original cable','iPhone 7 and later','Boot'],
 ['System Recovery','Deep recovery; may erase data.','Backup recommended · Recovery or DFU Mode','iPhone 8 and later','Deep']];
P.repair=()=>`<div class="fade"><h1>iOS System Repair</h1><p class="mut">Choose a repair path. Each begins with a diagnostic checklist.</p><div class="grid g3">${REP.map((r,i)=>`<div class="card"><div class="ico">${ic('repair')}</div><h2>${r[0]}</h2><p class="mut">${r[1]}</p><p style="font-size:14px"><b>Requires:</b> ${r[2]}</p><p style="font-size:14px"><span class="dot ok"></span> ${r[3]}</p><button class="btn" data-act="rep:${i}">Continue</button></div>`).join('')}
<div class="card"><div class="ico">${ic('info')}</div><h2>Frozen / unresponsive</h2><p class="mut">Try a force restart before repair.</p><button class="btn sec" data-act="frozen">View steps</button></div></div></div>`;

P.info=()=>{const d=S.dev;return`<div class="fade"><h1>Device Information</h1><div class="card" style="max-width:640px">${pill()}<table style="margin-top:12px">
<tr><td>Model</td><td>${d?d.model:'—'}</td></tr><tr><td>Connection state</td><td>${d?'Connected':'Disconnected'}</td></tr><tr><td>Device mode</td><td>${d?d.mode:'—'}</td></tr><tr><td>Operating system</td><td>${d?d.ios:'—'}</td></tr><tr><td>Product type</td><td>${d?.product||'—'}</td></tr><tr><td>Serial number</td><td>${d?.serial||'—'}</td></tr><tr><td>UDID</td><td>${d?.udid||'—'}</td></tr><tr><td>Activation</td><td>${d?.activation||'—'}</td></tr><tr><td>Chip</td><td>${d?.chip||'—'}</td></tr><tr><td>ECID</td><td>${d?.ecid||'—'}</td></tr><tr><td>USB product ID</td><td>${d?.pid||'—'}</td></tr><tr><td>Data source</td><td>${d?'USB descriptor':'—'}</td></tr></table>
<div class="row" style="margin-top:16px"><button class="btn" data-act="detect">Detect Device</button></div></div></div>`};

const LANG=['English','Español','Français','Deutsch','Português','العربية','日本語'];
P.settings=()=>`<div class="fade"><h1>Settings</h1><div class="card" style="max-width:680px">
<div class="set"><div><b>Theme</b><div class="mut">Appearance of the interface</div></div><select data-sel="theme"><option value="">System</option><option value="dark">Midnight (dark)</option><option value="light">Light</option></select></div>
<div class="set"><div><b>Language</b><div class="mut">Interface language</div></div><select data-sel="lang">${LANG.map(l=>`<option>${l}</option>`).join('')}</select></div>
<div class="set"><div><b>USB connection</b><div class="mut">Auto-detect on launch (needs an installed engine)</div></div><input type="checkbox" data-chk="usb"></div>
<div class="set"><div><b>Notifications</b><div class="mut">Show status toasts</div></div><input type="checkbox" data-chk="notif" checked></div>

<div class="set"><div><b>Updates</b><div class="mut">Version ${APP.version}</div></div><button class="btn sec" data-act="upd">Check for updates</button></div><div class="row" style="margin-top:16px"><button class="btn sec" data-act="reset">Reset to defaults</button></div></div></div>`;

const FAQ=[['My iPhone is not detected.','Use an original cable, try another USB port, unlock the device and tap “Trust”. In a browser, WebUSB needs Chrome/Edge over HTTPS and may be blocked in embedded frames.'],['Will repair erase my data?','Standard Repair is designed to keep data; System Recovery may erase it. Always back up first.'],['Stuck on the Apple logo?','Try the Apple Logo Fix flow, then a force restart, then Recovery Mode.'],['Why does exit say no engine?','This build has no device communication engine, so it will not claim any real operation.']];
P.help=()=>`<div class="fade"><h1>Help & Support</h1><div class="grid g2"><div class="card"><h2>FAQ</h2>${FAQ.map(f=>`<details><summary>${f[0]}</summary><p class="mut">${f[1]}</p></details>`).join('')}</div>
<div class="card"><h2>Connection troubleshooting</h2><ol class="mut" style="line-height:1.9"><li>Use an Apple-certified cable.</li><li>Unlock the iPhone and tap Trust.</li><li>Try a different USB port, avoid hubs.</li><li>Restart the computer and the iPhone.</li></ol><div class="row"><button class="btn" data-act="detect">Test connection</button><button class="btn sec" data-act="support">Contact support</button></div></div></div></div>`;

function render(){
 $('#side').innerHTML=`<div class="logo"><img src="assets/icon.png" alt="" width="40" height="40"><span>OPEN</span></div>`+NAV.map(n=>`<button class="nav ${S.page===n[0]?'on':''}" data-act="go:${n[0]}">${ic(n[0])}<span>${n[1]}</span></button>`).join('');
 $('#main').innerHTML=(P[S.page]||(()=>''))();$('#eng').textContent=Engine.name;const lg=$('[data-sel=lang]');if(lg)lg.value=S.lang;applyLang();
 const th=$('[data-sel=theme]');if(th)th.value=document.documentElement.dataset.theme||'';
}
const go=p=>{S.page=p;if(p==='enter'&&S.dev&&S.dev.product){const gi=groupFor(S.dev.product);if(gi>=0){S.rg=gi;S.rs=0}}if(p==='exit')S.ex={st:'idle',p:0};render();$('#main').scrollTop=0};

async function detect(){
  modal('<div class="spin"></div><p style="text-align:center">Scanning USB…</p>');
 try{S.dev=await Engine.detect();closeM();toast('Device seen: '+S.dev.mode)}
 catch(e){closeM();S.dev=null;modal(`<h2>No device detected</h2><p class="mut">${e.message||'No device selected.'}</p><p class="mut">Use Chrome or Edge over HTTPS, a data-capable Apple cable, and an iPhone in Recovery or DFU Mode.</p><button class="btn" data-act="mx2">OK</button>`)}
 render()}
async function exitGo(){modal(`<h2>Exit Recovery Mode?</h2><p class="mut">The device will be asked to leave Recovery Mode.</p><div class="row"><button class="btn" data-act="exitok">Confirm</button><button class="btn sec" data-act="mx2">Cancel</button></div>`)}
async function exitRun(){closeM();S.ex={st:'run',p:0};render();
 S.ex.p=40;render();try{await Engine.exitRecovery();S.ex={st:'ok',p:100};S.dev=null}catch(e){S.ex={st:'err',p:0,msg:e.message}}
 render()}
function repair(i){const r=REP[i];modal(`<h2>${r[0]}</h2><p class="mut">${r[1]}</p><p><b>Requirements:</b> ${r[2]}</p><p><b>Compatibility:</b> ${r[3]}</p><p><b>Diagnostic checklist</b></p>${['Cable is connected and the iPhone is unlocked','I have backed up important data','Device has at least 20% battery'].map(x=>`<label style="display:block;margin:6px 0"><input type="checkbox" class="chk"> ${x}</label>`).join('')}<div class="row" style="margin-top:16px"><button class="btn" data-act="repgo:${i}">Start diagnosis</button><button class="btn sec" data-act="mx2">Cancel</button></div>`)}

document.addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(!el)return;
 if(el.dataset.act==='mx'&&e.target!==el)return;
 const[a,v]=el.dataset.act.split(':');
 ({go:()=>{closeM();go(v)},detect,disc:()=>{S.dev=null;render();toast('Disconnected')},
 rg:()=>{S.rg=+v;S.rs=0;render()},prev:()=>{S.rs--;render()},
 next:()=>{if(S.rs<GR[S.rg].s.length-1){S.rs++;render()}else modal(`<h2>Recovery steps complete</h2><p class="mut">If your iPhone shows the “Connect to computer” screen, use Detect Device to check. Open will not claim success until a device is actually seen.</p><div class="row"><button class="btn" data-act="go:home">Go to Home</button><button class="btn sec" data-act="mx2">Close</button></div>`)},
 cancel:()=>modal(`<h2>Cancel guide?</h2><p class="mut">Your progress will be lost.</p><div class="row"><button class="btn dng" data-act="cx">Cancel guide</button><button class="btn sec" data-act="mx2">Keep going</button></div>`),
 cx:()=>{S.rs=0;closeM();go('home')},autoenter:autoEnter,install:()=>install(+v),bk:backup,rs:()=>doRestore(+v===1),report:exportReport,upd:checkUpd,store:()=>native.openStore(),legalview:()=>{closeM();go('legal')},eula:()=>{try{localStorage.setItem('eula','1')}catch(e){}closeM();checkDriver('first')},decline:()=>window.close(),drvchk:()=>checkDriver('manual'),reboot:()=>native.installUpdate(),mx2:closeM,mx:closeM,exitgo:exitGo,exitok:exitRun,exrst:()=>{S.ex={st:'idle',p:0};render()},
 rep:()=>repair(+v),repgo:()=>repGo(+v),
 frozen:()=>modal(`<h2>Force restart</h2><ol class="mut"><li>Press and release Volume Up.</li><li>Press and release Volume Down.</li><li>Hold the Side button until the Apple logo appears.</li></ol><button class="btn" data-act="mx2">Got it</button>`),
 support:()=>modal(`<h2>Support</h2><p class="mut">Email: <a href="mailto:${APP.support}" style="color:var(--ac)">${APP.support}</a></p><button class="btn" data-act="mx2">Close</button>`),
 reset:()=>{delete document.documentElement.dataset.theme;render();toast('Settings reset')}}[a]||(()=>{}))()});
document.addEventListener('change',e=>{const t=e.target;
 if(t.dataset.sel==='theme'){t.value?document.documentElement.dataset.theme=t.value:delete document.documentElement.dataset.theme}
 if(t.dataset.sel==='lang')setLang(t.value);
});
async function autoDetect(){try{const l=(await navigator.usb.getDevices()).filter(x=>x.vendorId===0x05ac);if(l.length){S.dev=await Engine.detect(l[0]);render();toast('Device detected: '+S.dev.mode)}}catch(e){}}
if(navigator.usb){navigator.usb.addEventListener('connect',e=>{if(e.device.vendorId===0x05ac)setTimeout(autoDetect,700)});setInterval(()=>{if(!S.dev)autoDetect()},3000);autoDetect()}
async function autoEnter(){modal('<div class="spin"></div><p style="text-align:center">Requesting Recovery Mode…</p>');const l=await native.run('idevice_id',['-l']),u=(l.out||'').split(/\s+/)[0];
 if(!l.ok||!u)return modal(`<h2>No iPhone found</h2><p class="mut">${l.missing?'Device tools are missing from this installation.':'Connect and unlock the iPhone, then tap Trust.'}</p><button class="btn" data-act="mx2">OK</button>`);
 const r=await native.run('ideviceenterrecovery',[u]);modal(`<h2>${r.ok?'Request sent':'Request failed'}</h2><p class="mut">${r.out||'The iPhone will restart into Recovery Mode and be detected automatically.'}</p><button class="btn" data-act="mx2">OK</button>`)}
function live(title,tool,args){
 modal(`<h2>${title}</h2><p id="lp" class="mut">Starting…</p><div class="bar"><b id="lb" style="width:3%"></b></div><pre id="ll" class="mut" style="font-size:14px;max-height:120px;overflow:auto;white-space:pre-wrap"></pre><p class="mut" style="font-size:14px">Do not disconnect the iPhone or close Open.</p>`);
 native.onOutput(t=>{const m=[...t.matchAll(/(\d{1,3})(?:\.\d+)?\s*%/g)].pop(),b=$('#lb'),l=$('#ll');if(!b)return;if(m){const p=Math.min(100,+m[1]);b.style.width=p+'%';$('#lp').textContent=p+'%'}if(l){l.textContent+=t;l.scrollTop=l.scrollHeight}});
 return native.run(tool,args)}
const esc=t=>(t||'').replace(/</g,'&lt;');
function result(ok,okT,failT,out,more=''){modal(`<h2>${ok?okT:failT}</h2><pre style="white-space:pre-wrap;max-height:200px;overflow:auto" class="mut">${esc(out.slice(-900))}</pre><div class="row">${more}<button class="btn sec" data-act="mx2">Close</button></div>`)}
async function install(erase){
 if(!erase)return doRestore(false);
 const n=S.dev&&S.dev.mode==='Normal Mode';
 modal(`<h2>Back up before erasing</h2><p class="mut">Erase &amp; Restore permanently deletes everything on the iPhone. ${n?'Create a backup first to keep your data.':'A backup cannot be made while the iPhone is outside iOS. If possible, start it normally and back it up first.'}</p><div class="row">${n?'<button class="btn" data-act="bk">Back up now</button>':''}<button class="btn dng" data-act="rs:1">Erase without backup</button><button class="btn sec" data-act="mx2">Cancel</button></div>`)}
async function backup(){const dir=await native.pickDir();if(!dir)return;const r=await live('Backing up iPhone','idevicebackup2',['backup',dir]);
 result(r.ok,'Backup complete','Backup failed',r.out,r.ok?'<button class="btn dng" data-act="rs:1">Continue to erase</button>':'')}
async function doRestore(erase){if(erase&&!confirm('This will ERASE ALL DATA on the iPhone. Continue?'))return;
 const r=await live(erase?'Erase & Restore':'Updating iOS','idevicerestore',erase?['-e','-l']:['-l']);result(r.ok,'Finished','Installation failed',r.out)}
function checkUpd(){window.native?native.checkUpdates().then(toast):toast('Updates are checked in the installed app.')}
if(window.native)native.onUpdate(u=>{if(u.state==='downloaded')modal(`<h2>Update ready</h2><p class="mut">Open ${u.version} has been downloaded.</p><div class="row"><button class="btn" data-act="reboot">Restart now</button><button class="btn sec" data-act="mx2">Later</button></div>`);else if(u.state==='available')toast('Downloading update '+u.version+'…')});
try{S.lang=localStorage.getItem('lang')||'English'}catch(e){S.lang='English'}
function applyLang(){const d=window.I18N[S.lang];document.documentElement.dir=S.lang==='العربية'?'rtl':'ltr';
 const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
 while(n=w.nextNode()){n.__o=n.__o??n.nodeValue;const t=n.__o.trim();n.nodeValue=d&&d[t]?n.__o.replace(t,d[t]):n.__o}}
function setLang(l){S.lang=l;try{localStorage.setItem('lang',l)}catch(e){}render()}
P.legal=()=>{const C=APP.company,N=APP.name;return`<div class="fade"><h1>Legal</h1><p class="mut">Effective ${APP.effective}</p><div class="card" style="max-width:820px;line-height:1.6">
<details open><summary>End User License Agreement</summary>
<p class="mut"><b>1. License.</b> ${C} grants you a personal, non-exclusive, non-transferable, revocable license to install and use ${N}, free of charge, on computers you own or control, to service iPhones that you own or are authorized by the owner to service.</p>
<p class="mut"><b>2. Restrictions.</b> You may not copy, modify, reverse engineer, decompile, sell, rent, sublicense or redistribute ${N}, except where the law or an open-source license expressly allows it. You may not use ${N} on a device you do not own and have no permission to service, or to attempt to bypass Activation Lock, Apple ID or other ownership protections.</p>
<p class="mut"><b>3. Your data and devices.</b> Recovery, repair, update and restore operations can erase data and can fail. You are responsible for backing up your data first. ${N} does not recover data that has already been erased.</p>
<p class="mut"><b>4. Ownership.</b> ${C} and its licensors keep all rights in ${N}. Open-source components remain under their own licenses (see Open-source notices).</p>
<p class="mut"><b>5. Updates.</b> ${N} may download and install updates to improve compatibility and security. Some features depend on third-party services and on Apple software that may change.</p>
<p class="mut"><b>6. No warranty.</b> ${N} is provided “as is” and “as available”, without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose and non-infringement. We do not guarantee compatibility with every device or iOS version, or that operation will be uninterrupted or error-free.</p>
<p class="mut"><b>7. Limitation of liability.</b> To the maximum extent permitted by law, ${C} is not liable for loss of data, device damage, loss of profits or any indirect, incidental or consequential damages. Because ${N} is provided free of charge, our total liability for any claim is limited to the extent the law permits. Nothing here limits liability that cannot be limited by law.</p>
<p class="mut"><b>8. Termination.</b> This license ends automatically if you break these terms. You may end it at any time by uninstalling ${N}.</p>
<p class="mut"><b>9. Governing law.</b> These terms are governed by the laws of ${APP.country}, without regard to conflict-of-law rules, and courts there have jurisdiction, except where consumer law gives you the right to use your local courts.</p>
<p class="mut"><b>10. Contact.</b> ${C}, ${APP.country}. ${APP.support}</p></details>
<details><summary>Privacy Policy</summary>
<p class="mut"><b>What ${N} processes.</b> To perform diagnostics, ${N} reads information from a connected iPhone: model, product type, serial number, UDID, ECID, iOS version, activation state, passcode status and battery level. This stays on your computer.</p>
<p class="mut"><b>What leaves your computer.</b> ${N} contacts api.ipsw.me to look up device names and currently signed iOS versions, and downloads iOS firmware from the address that service provides. The installed app checks GitHub for updates. These requests do not include your serial number, UDID or ECID. Those third parties handle connection data (such as your IP address) under their own policies.</p>
<p class="mut"><b>Backups.</b> Backups are written only to the folder you choose and are never uploaded by ${N}.</p>
<p class="mut"><b>Job history and shop details.</b> Customer names, notes, job history and shop details you enter stay on your computer. You can export or delete them at any time.</p>
<p class="mut"><b>Crash reports.</b> When you ask ${N} to read crash reports, they are copied from the device into a temporary folder on your computer, analyzed locally and then deleted. The reports stay on the device and are never uploaded.</p>
<p class="mut"><b>Firmware and support.</b> Firmware is downloaded from Apple’s servers and checked against its checksum. If you choose to send details to support by WhatsApp or email, only the report you reviewed is shared, and device identifiers are included only if you tick the box.</p>
<p class="mut"><b>Diagnostic reports and logs.</b> Reports are saved only when you export them. The app keeps a local log of technical events (no device identifiers) to help with support; you can delete it at any time.</p>
<p class="mut"><b>Sharing and sale.</b> ${C} does not sell your personal data and does not share device information with advertisers.</p>
<p class="mut"><b>Your rights.</b> Depending on where you live (for example the EU/UK GDPR or California law), you may have the right to access, correct, delete or restrict personal data we hold about you, and to complain to your data protection authority. Because ${N} keeps device data locally, most of this is under your control; for anything else contact ${APP.support}.</p>
<p class="mut"><b>Children.</b> ${N} is not directed to children under 13 (or the age required in your country).</p>
<p class="mut"><b>Security and changes.</b> We use technical measures to protect the app and its updates. We may update this policy and will show the new effective date. Controller: ${C}, ${APP.country}, ${APP.support}.</p></details>
<details><summary>Acceptable use and disclaimer</summary>
<p class="mut">Use ${N} only for lawful purposes and only on devices you own or have written permission to service. Do not use it on lost or stolen devices. Repair outcomes depend on the device’s hardware and software condition; ${N} cannot fix hardware faults, remove iCloud Activation Lock, bypass an Apple ID or recover erased data.</p></details>
<details><summary>Open-source notices</summary>
<p class="mut">${N} uses libimobiledevice, libirecovery, idevicerestore and related libraries (LGPL-2.1 and GPL-3.0 components), Electron (MIT) and electron-updater (MIT). Full license texts and the corresponding source code for the LGPL/GPL components are available on request from ${APP.support} and from the upstream projects.</p></details>
<details><summary>Trademarks</summary>
<p class="mut">iPhone, iOS, iTunes and Apple are trademarks of Apple Inc. ${N} is an independent product and is not affiliated with, authorized or endorsed by Apple Inc.</p></details></div></div>`};

let drvTimer=null;
async function checkDriver(mode='poll'){
 if(!window.native||native.platform!=='win32')return;
 const r=await native.driverStatus();
 if(r.installed){clearInterval(drvTimer);drvTimer=null;if(mode!=='first'){if($('#modal .drv'))closeM();toast('Apple driver found. Connect your iPhone.')}return}
 if(mode==='first'){modal(`<div class="drv"><h2>One quick setup step</h2><p class="mut">Windows needs Apple’s USB driver to talk to an iPhone. It comes free with Apple Devices from the Microsoft Store.</p><ol class="mut"><li>Click Install Apple Devices, then press Get in the Store.</li><li>Wait for it to finish and come back here. Open will notice automatically.</li></ol><div class="row"><button class="btn" data-act="store">Install Apple Devices</button><button class="btn sec" data-act="drvchk">Check again</button><button class="btn sec" data-act="mx2">Not now</button></div></div>`);drvTimer=setInterval(checkDriver,4000)}
 else if(mode==='manual')toast('Not installed yet. Finish the install in the Microsoft Store.')}
render();
function boot(){let ok=false;try{ok=localStorage.getItem('eula')==='1'}catch(e){}
 if(ok)return checkDriver('first');
 $('#modal').innerHTML=`<div class="modal"><div class="card fade"><h2>License Agreement</h2><p class="mut">Before using ${APP.name}, please read and accept the License Agreement, Privacy Policy and Acceptable Use terms. Erase and restore operations delete data; back up first and use ${APP.name} only on iPhones you own or are authorized to service.</p><div class="row"><button class="btn" data-act="eula">I agree</button><button class="btn sec" data-act="legalview">Read terms</button><button class="btn sec" data-act="decline">Decline</button></div></div></div>`}
boot();
window.addEventListener('error',()=>toast('Something went wrong. The app is still running.'));
window.addEventListener('unhandledrejection',e=>{e.preventDefault();toast('An operation failed. Please try again.')});
