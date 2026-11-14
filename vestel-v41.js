/* KUKİ PLAYER Vestel/Foxxum 4.0: ES5 browser client, Samsung/LG-style TV UI */
(function (window,document) {
'use strict';
var API='https://jelkfpfpqaialuwhelhd.supabase.co/functions/v1/kuki-device-api';
var STORE='kuki_foxxum_device_identity_v1', LEGAL='kuki_foxxum_legal_v1';
var screen='legal', device=null, authorized=false, busy=false, playerHls=null, playerTs=null, currentLive=null;
var server='',username='',password='', dataLoaded=false, loading=false, overlayTimer=null;
var lists={live:[],movies:[],series:[]},cats={live:[],movies:[],series:[]};
var choice={live:'all',movies:'all',series:'all'}, lastType='movies',selected=null,episode=null;
var favorites={},cache={},liveFullscreen=false;
var exitDialogOpen=false,exitBeforeFocus=null,exitBusy=false;
var heroMovies=[],heroIndex=0,heroTimer=null; 
function el(id){return document.getElementById(id);}
function say(id,s){if(el(id))el(id).textContent=String(s||'');}
function save(k,v){try{window.localStorage.setItem(k,v);return true;}catch(e){return false;}}
function read(k){try{return window.localStorage.getItem(k)||'';}catch(e){return '';}}
function del(k){try{window.localStorage.removeItem(k);}catch(e){}}
function escapeText(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function validDevice(x){return !!(x&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x.device_id||'')&&/^[0-9a-f]{64}$/i.test(x.device_token||''));}
function loadDevice(){var v=null;try{v=JSON.parse(read(STORE));}catch(e){}return validDevice(v)?v:null;}
function toast(msg){var node=el('toast');node.textContent=msg;node.style.display='block';if(overlayTimer)clearTimeout(overlayTimer);overlayTimer=setTimeout(function(){node.style.display='none';},5500);}
function activeButtons(){var all=el(screen).querySelectorAll('.nav'),out=[],i;for(i=0;i<all.length;i++)if(!all[i].disabled&&all[i].offsetWidth>0)out.push(all[i]);return out;}
function focusFirst(){var buttons=activeButtons();if(buttons.length){try{buttons[0].focus();}catch(e){}}}
function enterLiveFullscreen(){
 if(screen!=='live'||!currentLive||liveFullscreen)return;
 liveFullscreen=true;
 el('live').className+=' fullscreen';
}
function focusPlayingLiveChannel(){
 if(screen!=='live'||!currentLive)return;
 var nodes=el('live-list').querySelectorAll('button[data-stream-id]'),i,
     id=itemID('live',currentLive);
 for(i=0;i<nodes.length;i++){
  if(nodes[i].getAttribute('data-stream-id')===id){
   try{nodes[i].focus();nodes[i].scrollIntoView(false);}catch(e){}
   break;
  }
 }
}
function exitLiveFullscreen(){
 if(!liveFullscreen)return;
 liveFullscreen=false;
 el('live').className=el('live').className.replace(/\s*fullscreen\b/g,'');
 focusPlayingLiveChannel();
}
function switchTo(id){if(!el(id))return;exitLiveFullscreen();if(screen==='live'&&id!=='live')currentLive=null;stopVideo();var all=document.querySelectorAll('.screen'),i;for(i=0;i<all.length;i++)all[i].className=all[i].className.replace(/\s*active\b/g,'');el(id).className+=' active';screen=id;if(id==='home'){tickClock();if(dataLoaded)updateHero();}setTimeout(focusFirst,20);}
function directional(key){
 var current=document.activeElement,all=activeButtons(),idx=all.indexOf?all.indexOf(current):Array.prototype.indexOf.call(all,current);
 if(!all.length)return;
 if(idx<0){all[0].focus();return;}
 var x=current.getBoundingClientRect(), cx=(x.left+x.right)/2,cy=(x.top+x.bottom)/2, best=null,score=1e15,i;
 for(i=0;i<all.length;i++){
   if(all[i]===current)continue;
   var rect=all[i].getBoundingClientRect(), dx=(rect.left+rect.right)/2-cx,dy=(rect.top+rect.bottom)/2-cy;
   var aligned=(key===37&&dx< -10)||(key===39&&dx>10)||(key===38&&dy< -10)||(key===40&&dy>10);
   if(!aligned)continue;
   var horizontal=key===37||key===39;
   var main=horizontal?Math.abs(dx):Math.abs(dy),other=horizontal?Math.abs(dy):Math.abs(dx);
   var points=main+other*2.3;
   if(points<score){score=points;best=all[i];}
 }
 if(!best){best=all[(idx+(key===37||key===38?-1:1)+all.length)%all.length];}
 try{best.focus();if(best.scrollIntoView)best.scrollIntoView({block:'nearest',inline:'nearest'});}catch(e){}
}
function setClock(){var d=new Date(),hh=d.getHours(),mm=d.getMinutes();say('clock',(hh<10?'0':'')+hh+':'+(mm<10?'0':'')+mm);}
function tickClock(){setClock();}
function stopVideo(){
 var vids=[el('live-video'),el('movie-video')],i;
 if(playerHls){try{playerHls.destroy();}catch(e){}playerHls=null;}
 if(playerTs){try{playerTs.destroy();}catch(e){}playerTs=null;}
 for(i=0;i<vids.length;i++)if(vids[i]){try{vids[i].pause();vids[i].removeAttribute('src');vids[i].load();}catch(e){}}
}
function requestJSON(url,payload,callback){
 var xhr,done=false,tid;
 function finish(err,data){if(done)return;done=true;if(tid)clearTimeout(tid);callback(err,data);}
 try{
  xhr=new XMLHttpRequest();xhr.open(payload?'POST':'GET',url,true);try{xhr.timeout=14000;}catch(e){}
  if(payload)xhr.setRequestHeader('Content-Type','application/json');
  xhr.onload=function(){var dat=null,s=xhr.status||0;
    try{dat=JSON.parse(xhr.responseText||'{}');}catch(e){return finish('Sunucu yanıtı okunamadı (HTTP '+s+').');}
    if(s<200||s>=300)return finish(dat.message||('HTTP '+s));finish(null,dat);
  };
  xhr.onreadystatechange=function(){if(xhr.readyState===4)setTimeout(function(){if(!done&&xhr.status)xhr.onload();},180);};
  xhr.onerror=function(){finish('Ağ erişimi reddedildi. HTTPS/CORS ayarlarını kontrol edin.');};
  xhr.ontimeout=function(){finish('Sunucu yanıtı zaman aşımına uğradı.');};
  tid=setTimeout(function(){if(!done){try{xhr.abort();}catch(e){}finish('Sunucudan zamanında yanıt alınamadı.');}},16000);
  xhr.send(payload?JSON.stringify(payload):null);
 }catch(e){finish('TV tarayıcısı bağlantıyı başlatamadı.');}
}
function deviceCall(action,extra,cb){
 var b={action:action,platform:'vestel_foxxum',app_version:'foxxum-v4.0'},k;
 for(k in extra)if(Object.prototype.hasOwnProperty.call(extra,k))b[k]=extra[k];
 requestJSON(API,b,function(error,data){
  if(!error&&(!data||data.success!==true))error=(data&&data.message)||'Cihaz API yanıtı geçersiz.';
  cb(error,data||{});
 });
}
function beginPair(){
 if(busy)return;
 busy=true;say('pair-status','Cihaz hesabı kontrol ediliyor...');el('pair-retry').disabled=true;
 if(!device)device=loadDevice();
 if(device){deviceCall('check_activation',{device_id:device.device_id,device_token:device.device_token},function(err,d){
  busy=false;el('pair-retry').disabled=false;
  if(err){say('pair-status','Kontrol başarısız: '+err);return;}
  if(d.activation_code&&/^[0-9]{6}$/.test(String(d.activation_code))){device.activation_code=String(d.activation_code);save(STORE,JSON.stringify(device));}
  if(d.activation==='active'&&d.server_url&&d.account_username&&d.account_password){
   authorized=true;server=String(d.server_url).replace(/\/+$/,'');username=String(d.account_username);password=String(d.account_password);
   say('pair-status','Cihaz etkinleştirildi. Menü açılıyor...');
   switchTo('home');fetchCatalog();return;
  }
  say('pair-code',device.activation_code||'------');say('pair-status','Eşleştirme bekleniyor. Yönetim panelinden etkinleştirdikten sonra TEKRAR YÜKLE deyin.');
 });return;}
 deviceCall('register_device',{},function(err,d){
  busy=false;el('pair-retry').disabled=false;
  if(err){say('pair-status','Kayıt başarısız: '+err);return;}
  var value={device_id:String(d.device_id||''),device_token:String(d.device_token||''),activation_code:String(d.activation_code||'')};
  if(!validDevice(value)||!/^[0-9]{6}$/.test(value.activation_code)){say('pair-status','Cihaz kimliği ya da kodu beklenen biçimde gelmedi.');return;}
  device=value;save(STORE,JSON.stringify(device));say('pair-code',device.activation_code);
  say('pair-status','Kod hazır. www.kukiplayer.net panelinde cihazı etkinleştirin.');
 });
}
function apiBase(){return server+'/player_api.php?username='+encodeURIComponent(username)+'&password='+encodeURIComponent(password);}
function xtream(action,extra,cb){requestJSON(apiBase()+'&action='+encodeURIComponent(action)+(extra||''),null,cb);}
function fetchCatalog(){
 if(!authorized||loading)return;
 loading=true;dataLoaded=false;toast('Kategoriler ve içerikler getiriliyor...');
 var types=['get_live_categories','get_live_streams','get_vod_categories','get_vod_streams','get_series_categories','get_series'],values=[],pending=types.length,failed=0;
 function done(){pending--;if(pending)return;loading=false;dataLoaded=true;
  cats.live=Array.isArray(values[0])?values[0]:[];lists.live=Array.isArray(values[1])?values[1]:[];
  cats.movies=Array.isArray(values[2])?values[2]:[];lists.movies=Array.isArray(values[3])?values[3]:[];
  cats.series=Array.isArray(values[4])?values[4]:[];lists.series=Array.isArray(values[5])?values[5]:[];
  drawAll();initHeroSlider();updateHero();
  if(failed)toast('Bazı listeler getirilemedi ('+failed+'/6). Sunucu HTTPS/CORS veya hesap bilgilerini kontrol edin.');
  else toast('İçerikler hazır: '+lists.live.length+' kanal, '+lists.movies.length+' film, '+lists.series.length+' dizi.');
 }
 for(var i=0;i<types.length;i++){(function(j){xtream(types[j],'',function(err,dat){if(err){failed++;values[j]=[];}else values[j]=dat;done();});})(i);}
}
function catID(obj){return String(obj.category_id==null?'':obj.category_id);}
function itemID(type,x){return String(type==='series'?x.series_id:x.stream_id);}
function titleOf(x){return String(x.name||x.title||'İsimsiz');}
function favKey(type){return 'kuki_vestel_favorites_'+type+'_v1';}
function getFav(type){var raw=read(favKey(type)),arr;try{arr=JSON.parse(raw);}catch(e){}return Array.isArray(arr)?arr:[];}
function hasFav(type,x){return getFav(type).indexOf(itemID(type,x))!==-1;}
function toggleFav(type,x){var f=getFav(type),id=itemID(type,x),i=f.indexOf(id);if(i>=0)f.splice(i,1);else f.push(id);save(favKey(type),JSON.stringify(f));toast(i>=0?'Favorilerden çıkarıldı.':'Favorilere eklendi.');drawType(type);}
function safeImage(src){var s=String(src||'');return /^https?:\/\//i.test(s)?s:'';}
function emptyList(node,msg){node.innerHTML='';var d=document.createElement('div');d.className='empty';d.textContent=msg;node.appendChild(d);}
function makeButton(label,cls,onClick){var b=document.createElement('button');b.type='button';b.className=cls+' nav';b.textContent=label;b.onclick=onClick;return b;}
function drawCats(type){
 var root=el(type+'-cats'),categories=cats[type],c,i;root.innerHTML='';
 c=makeButton('TÜMÜ ('+lists[type].length+')','rowitem',function(){choice[type]='all';drawType(type);});root.appendChild(c);
 c=makeButton('♥ FAVORİLER','rowitem',function(){choice[type]='fav';drawType(type);});root.appendChild(c);
 for(i=0;i<categories.length;i++){(function(cat){var b=makeButton(cat.category_name||'Kategori','rowitem',function(){choice[type]=catID(cat);drawType(type);});root.appendChild(b);})(categories[i]);}
}
function filtered(type){
 var all=lists[type],cat=choice[type],q=(el(type+'-search')||{value:''}).value.toLowerCase().replace(/^\s+|\s+$/g,''),out=[],i,x;
 for(i=0;i<all.length;i++){x=all[i];if(cat==='fav'&&!hasFav(type,x))continue;if(cat!=='fav'&&cat!=='all'&&String(x.category_id||'')!==cat)continue;if(q&&titleOf(x).toLowerCase().indexOf(q)<0)continue;out.push(x);}
 return out;
}
function drawType(type){
 var all=filtered(type),root=el(type+'-list'),max=type==='live'?250:130,i;
 root.innerHTML='';
 var catsNode=el(type+'-cats'),b=catsNode.querySelectorAll('.rowitem');
 for(i=0;i<b.length;i++){b[i].className='rowitem nav'+((choice[type]==='all'&&i===0)||(choice[type]==='fav'&&i===1)||(i>=2&&catID(cats[type][i-2])===choice[type])?' active':'');}
 say(type+'-total',all.length+' içerik');
 if(!all.length){emptyList(root,lists[type].length?'Seçilen bölümde içerik bulunamadı.':'İçerikler henüz alınamadı. Sunucu erişimini kontrol edin.');return;}
 for(i=0;i<all.length&&i<max;i++){
  (function(item){
   if(type==='live'){
    var node=makeButton((hasFav(type,item)?'♥ ':'')+titleOf(item),'rowitem',function(){playLive(item);});
    node.setAttribute('data-stream-id',itemID('live',item));
    root.appendChild(node);
   }else{
    var card=document.createElement('button');card.type='button';card.className='poster nav';
    var src=safeImage(type==='movies'?(item.stream_icon||item.cover):(item.cover||item.stream_icon));
    if(src){var image=document.createElement('img');image.src=src;image.alt='';image.onerror=function(){this.style.display='none';};card.appendChild(image);}
    else {var noimg=document.createElement('div');noimg.className='noimg';noimg.textContent='▶';card.appendChild(noimg);}
    var span=document.createElement('span');span.textContent=(hasFav(type,item)?'♥ ':'')+titleOf(item);card.appendChild(span);
    card.onclick=function(){openDetail(type,item);};root.appendChild(card);
   }
  })(all[i]);
 }
 if(all.length>max){var more=document.createElement('div');more.className='empty';more.textContent='İlk '+max+' içerik gösteriliyor. Arama veya kategori kullanabilirsiniz.';root.appendChild(more);}
}
function drawAll(){var ts=['live','movies','series'];for(var i=0;i<ts.length;i++){drawCats(ts[i]);drawType(ts[i]);}}
function movieBannerCategoryName(name){
 // Turkish dotted I is sometimes lowercased as i + combining dot.
 return String(name||'').toLowerCase().replace(/\u0307/g,'').replace(/ı/g,'i');
}
function isRestrictedBannerTitle(name){
 return /(^|[\s\-])(adult|erotik|porno|porn|xxx|18\+|18 yaş|yetişkin)([\s\-]|$)/i.test(movieBannerCategoryName(name));
}
function initHeroSlider(){
 if(heroTimer){clearInterval(heroTimer);heroTimer=null;}
 heroMovies=[];heroIndex=0;
 var categoryId='',i,c,list=lists.movies||[],categories=cats.movies||[],movie,art;
 for(i=0;i<categories.length;i++){
  c=categories[i];
  if(movieBannerCategoryName(c.category_name).indexOf('vizyon')!==-1&&!isRestrictedBannerTitle(c.category_name)){
   categoryId=String(c.category_id);break;
  }
 }
 if(categoryId){
  for(i=0;i<list.length;i++){
   movie=list[i];
   art=safeImage(movie.stream_icon||movie.cover);
   if(String(movie.category_id)===categoryId&&art&&!isRestrictedBannerTitle(titleOf(movie))){
    heroMovies.push(movie);
    if(heroMovies.length===5)break;
   }
  }
 }
 if(heroMovies.length>1){
  heroTimer=setInterval(function(){
   if(screen!=='home')return; // Avoid poster rendering during video playback or menu browsing.
   heroIndex=(heroIndex+1)%heroMovies.length;
   showHeroSlide();
  },10000);
 }
 showHeroSlide();
}
function showHeroSlide(){
 var banner=el('hero-art'),frame=el('hero-art-frame'),hero=el('home').querySelector('.hero'),dots=el('hero-dots'),i,node,m,url;
 if(!heroMovies.length){
  hero.className='hero';
  frame.style.display='none';banner.removeAttribute('src');dots.innerHTML='';
  say('hero-head','MEDYA OYNATICI');say('hero-badge','KUKİ PLAYER');say('hero-rating','');
  el('hero-rating').style.display='none';return;
 }
 m=heroMovies[heroIndex];url=safeImage(m.stream_icon||m.cover);
 hero.className='hero has-posters';
 frame.style.display='block';
 banner.alt=titleOf(m)+' film afişi';
 banner.style.visibility='hidden';
 banner.onload=function(){this.style.visibility='visible';};
 banner.onerror=function(){this.style.visibility='hidden';};
 banner.src=url;
 say('hero-badge','VİZYONDAKİ FİLMLER');
 say('hero-head',titleOf(m));
 var rate=String(m.rating||m.rating_5based||'');
 say('hero-rating',rate?'★ '+rate:'');
 el('hero-rating').style.display=rate?'block':'none';
 dots.innerHTML='';
 for(i=0;i<heroMovies.length;i++){node=document.createElement('span');node.className='hero-dot'+(i===heroIndex?' on':'');dots.appendChild(node);}
}
function updateHero(){
 say('hero-desc',authorized?lists.live.length+' canlı kanal · '+lists.movies.length+' film · '+lists.series.length+' dizi':'Samsung ve LG ile aynı menü düzeni · Ön izleme modu');
 if(screen==='home'||screen==='pair')showHeroSlide();
}
function openDetail(type,x){
 lastType=type;selected=x;episode=null;
 say('detail-heading',type==='movies'?'Film Ayrıntıları':'Dizi Ayrıntıları');
 say('detail-title',titleOf(x));say('detail-desc',x.plot||x.description||'Açıklama bulunamadı.');
 say('detail-info',(x.releaseDate||x.release_date||x.year||'')+'  '+(x.rating?'★ '+x.rating:''));
 var src=safeImage(type==='movies'?(x.stream_icon||x.cover):x.cover);
 if(src){el('detail-poster').src=src;el('detail-poster').style.display='block';}else el('detail-poster').style.display='none';
 say('detail-fav',hasFav(type,x)?'♥ FAVORİDEN ÇIKAR':'♥ FAVORİ');
 el('detail-play').style.display=type==='series'?'none':'inline-block';
 emptyList(el('detail-episodes'),type==='series'?'Bölümler getiriliyor...':'');
 switchTo('detail');
 if(type==='movies')xtream('get_vod_info','&vod_id='+encodeURIComponent(x.stream_id),function(err,r){
  if(screen!=='detail'||selected!==x||err)return;
  var info=r.info||{};say('detail-desc',info.plot||x.plot||'Açıklama bulunamadı.');say('detail-info',(info.releaseDate||x.releaseDate||'')+'  '+(info.rating?'★ '+info.rating:''));
 });
 else xtream('get_series_info','&series_id='+encodeURIComponent(x.series_id),function(err,r){
  if(screen!=='detail'||selected!==x)return;
  var root=el('detail-episodes');root.innerHTML='';
  if(err||!r||!r.episodes){emptyList(root,'Bölüm bilgileri alınamadı.');return;}
  var seasons=Object.keys(r.episodes),i,j,arr;
  if(r.info&&r.info.plot)say('detail-desc',r.info.plot);
  for(i=0;i<seasons.length;i++){
   var label=document.createElement('h3');label.textContent='Sezon '+seasons[i];root.appendChild(label);
   arr=r.episodes[seasons[i]]||[];
   for(j=0;j<arr.length;j++){(function(ep){
    var b=makeButton('▶ '+(ep.title||('Bölüm '+ep.episode_num)),'rowitem',function(){episode=ep;startVOD('series',ep);});root.appendChild(b);
   })(arr[j]);}
  }
 });
}
function sourceURL(type,x){
 if(!server||!username||!password)return '';
 var ext=type==='live'?'m3u8':(x.container_extension||'mp4'),id=type==='series'?x.id:x.stream_id,section=type==='live'?'live':type==='movies'?'movie':'series';
 if(!/^[a-z0-9]{1,6}$/i.test(String(ext)))ext='mp4';
 if(!/^[a-zA-Z0-9_-]+$/.test(String(id)))return '';
 return server+'/'+section+'/'+encodeURIComponent(username)+'/'+encodeURIComponent(password)+'/'+encodeURIComponent(id)+'.'+ext;
}
function loadJs(src,cb){
 var existing=document.querySelector('script[data-vendor="'+src+'"]');
 if(existing){if(existing.getAttribute('data-loaded')==='1')cb();else existing.addEventListener('load',cb);return;}
 var s=document.createElement('script');s.src=src;s.setAttribute('data-vendor',src);
 s.onload=function(){s.setAttribute('data-loaded','1');cb();};
 s.onerror=function(){cb(new Error('Oynatıcı bileşeni yüklenemedi.'));};document.head.appendChild(s);
}
function startSource(video,url,label,isLive,fallback){
 if(!url){toast('Geçerli yayın bağlantısı bulunamadı.');return;}
 stopVideo();
 say(isLive?'live-name':'play-hint',label+' · Yükleniyor...');
 if(isLive){say('live-cover','Yayın yükleniyor...');el('live-cover').style.display='flex';}
 var ext=String(url).split('?')[0].toLowerCase(),hls=/\.m3u8$/i.test(ext);
 function play(){
  try{var promise=video.play();if(promise&&promise.catch)promise.catch(function(){toast('Oynatmak için OK tuşuna basın.');});}
  catch(e){toast('Video başlatılamadı.');}
 }
 function fail(msg){if(isLive){say('live-cover',msg);el('live-cover').style.display='flex';}
  else say('play-hint',msg);toast(msg);}
 video.onplaying=function(){if(isLive)el('live-cover').style.display='none';else say('play-hint',label);};
 video.onerror=function(){
  if(fallback&&url!==fallback){startSource(video,fallback,label,isLive,'');return;}
  fail('Yayın oynatılamadı. Video biçimi, HTTPS, CORS ve TV desteğini kontrol edin.');
 };
 if(hls&&!video.canPlayType('application/vnd.apple.mpegurl')&&!video.canPlayType('application/x-mpegURL')){
  loadJs('https://cdn.jsdelivr.net/npm/hls.js@1.4.12/dist/hls.min.js',function(err){
   if(err||!window.Hls||!window.Hls.isSupported()){fail('Bu Vestel tarayıcısında HLS oynatma desteği bulunamadı.');return;}
   try{playerHls=new window.Hls({enableWorker:false});playerHls.on(window.Hls.Events.ERROR,function(_event,d){if(d&&d.fatal)fail('HLS akışı çözümlenemedi.');});
     playerHls.loadSource(url);playerHls.attachMedia(video);playerHls.on(window.Hls.Events.MANIFEST_PARSED,play);
   }catch(e){fail('HLS başlatılamadı.');}
  });return;
 }
 video.src=url;play();
}
function changeFullscreenChannel(direction){
 if(!liveFullscreen||!currentLive)return;
 // Respect the channel category and search currently selected in the TV list.
 var available=filtered('live'),i=-1,k,target,next;
 if(available.length===0)available=lists.live;
 if(!available.length){toast('Kanal listesi boş.');return;}
 for(k=0;k<available.length;k++){
  if(itemID('live',available[k])===itemID('live',currentLive)){i=k;break;}
 }
 if(i<0){
  available=lists.live;
  for(k=0;k<available.length;k++){
   if(itemID('live',available[k])===itemID('live',currentLive)){i=k;break;}
  }
 }
 if(!available.length)return;
 next=(i+direction+available.length)%available.length;
 target=available[next];
 if(!target||itemID('live',target)===itemID('live',currentLive))return;
 // New channel needs a new stream; the fullscreen DOM layout stays in place.
 currentLive=target;
 say('live-name',titleOf(target));
 var url=sourceURL('live',target),alt=url.replace(/\.m3u8$/i,'.ts');
 startSource(el('live-video'),url,titleOf(target),true,alt!==url?alt:'');
}
function playLive(x){
 // Second OK on the same channel expands the existing video without
 // calling stopVideo(), changing the source URL or seeking.
 if(currentLive&&itemID('live',currentLive)===itemID('live',x)){
   enterLiveFullscreen();
   return;
 }
 exitLiveFullscreen();
 currentLive=x;
 say('live-name',titleOf(x));
 var url=sourceURL('live',x),alt=url.replace(/\.m3u8$/i,'.ts');
 startSource(el('live-video'),url,titleOf(x),true,alt!==url?alt:'');
}
function startVOD(type,x){
 if(!authorized){toast('Menü ön izlemesinde yayın oynatılamaz.');return;}
 var url=sourceURL(type,x);
 switchTo('play-screen');
 say('play-hint',titleOf(x));
 startSource(el('movie-video'),url,titleOf(x),false,'');
}
var reloadInProgress=false;
function refresh(){
 // Reload the application AND its media catalog on the stable Web App Tester path.
 // Existing boot() recovers localStorage pairing and calls fetchCatalog().
 // A changing query prevents the old Vestel OMI HTML from being served from cache.
 if(reloadInProgress)return;
 reloadInProgress=true;
 toast('KUKİ PLAYER yeniden başlatılıyor. Güncel uygulama ve içerikler yükleniyor...');
 var path=window.location.pathname||'/kuki-player-vestel-foxxum/index-v41.html';
 var url=path+'?update='+new Date().getTime();
 window.setTimeout(function(){
  try{window.location.replace(url);}
  catch(e){window.location.href=url;}
 },250);
}
function logout(){
 if(!device||busy)return;
 var yes=window.confirm('Bu cihazın hesabını kaldırıp yeni eşleştirme kodu oluşturulsun mu?');
 if(!yes)return;
 busy=true;
 deviceCall('reset_pairing',{device_id:device.device_id,device_token:device.device_token},function(err,d){
  busy=false;
  if(err){toast('Hesaptan çıkış başarısız: '+err);return;}
  authorized=false;server='';username='';password='';dataLoaded=false;lists={live:[],movies:[],series:[]};cats={live:[],movies:[],series:[]};
  device.activation_code=d.activation_code;save(STORE,JSON.stringify(device));say('pair-code',device.activation_code);
  say('pair-status','Yeni kod hazır. Yönetim panelinden yeniden etkinleştirin.');
  switchTo('pair');
 });
}
function legalUpdate(){var area=el('legal-text');var end=area.scrollTop+area.clientHeight>=area.scrollHeight-12;el('legal-accept').disabled=!end;say('legal-status',end?'Bilgilendirmeyi okudunuz. Kabul ederek devam edebilirsiniz.':'Kumandanın AŞAĞI tuşuyla metni sonuna kadar okuyunuz.');}

function showExitDialog(){
 if(screen!=='home'||exitDialogOpen)return;
 exitDialogOpen=true;exitBusy=false;exitBeforeFocus=document.activeElement;
 say('exit-feedback','');
 el('exit-dialog').className='';
 try{el('exit-no').focus();}catch(e){}
}
function dismissExitDialog(){
 if(!exitDialogOpen)return;
 exitDialogOpen=false;exitBusy=false;
 el('exit-dialog').className='hidden';
 say('exit-feedback','');
 try{if(exitBeforeFocus&&exitBeforeFocus.focus)exitBeforeFocus.focus();else focusFirst();}catch(e){}
 exitBeforeFocus=null;
}
function confirmExit(){
 if(!exitDialogOpen||exitBusy)return;
 exitBusy=true;
 say('exit-feedback','Uygulamadan çıkılıyor...');
 // Native method is part of Smart TV Alliance. Web App Tester may not expose it.
 try{
  if(window.SmartTvA_API&&typeof window.SmartTvA_API.exit==='function'){
   window.SmartTvA_API.exit();
  }
 }catch(e){}
 try{window.close();}catch(e){}
 window.setTimeout(function(){
  if(!exitDialogOpen)return;
  if(document.visibilityState==='hidden')return;
  try{
   if(window.history&&window.history.length>1){window.history.back();return;}
  }catch(e){}
  say('exit-feedback','Otomatik çıkış TV tarafından engellendi. Kumandanın EXIT veya HOME tuşuyla çıkabilirsiniz.');
  exitBusy=false;
 },650);
}

function onKey(e){
 e=e||window.event;
 var key=e.keyCode||e.which;
 if(exitDialogOpen){
  if(key===8||key===27||key===461||key===10009||key===166){
   dismissExitDialog();
  }else if(key===37||key===38||key===39||key===40){
   try{(document.activeElement===el('exit-no')?el('exit-yes'):el('exit-no')).focus();}catch(er){}
  }else if(key===13){
   if(document.activeElement===el('exit-yes'))confirmExit();
   else dismissExitDialog();
  }
  if(e.preventDefault)e.preventDefault();
  if(e.stopPropagation)e.stopPropagation();
  return false;
 }
 if(screen==='legal'){
  if(key===40||key===34){el('legal-text').scrollTop+=100;legalUpdate();if(!el('legal-accept').disabled)el('legal-accept').focus();}
  else if(key===38||key===33){el('legal-text').scrollTop-=95;legalUpdate();}
  else if(key===13&&!el('legal-accept').disabled){el('legal-accept').click();}
  else return;
  if(e.preventDefault)e.preventDefault();return false;
 }
 if(liveFullscreen){
  // Vestel program +/- variants, browser PageUp/PageDown,
  // generic Smart TV CH+/CH-, plus arrow up/down as a fallback.
  var keyName=String(e.key||'').toLowerCase();
  var channelUp=(key===427||key===1032||key===33||key===38||
    keyName==='channelup'||keyName==='pageup');
  var channelDown=(key===428||key===1033||key===34||key===40||
    keyName==='channeldown'||keyName==='pagedown');
  if(channelUp||channelDown){
   changeFullscreenChannel(channelUp?1:-1);
   if(e.preventDefault)e.preventDefault();
   if(e.stopPropagation)e.stopPropagation();
   return false;
  }
  if(key===8||key===27||key===461||key===10009||key===166){
   exitLiveFullscreen();if(e.preventDefault)e.preventDefault();return false;
  }
  if(key===13||key===37||key===39){if(e.preventDefault)e.preventDefault();return false;}
 }
 if(key===8||key===27||key===461||key===10009||key===166){if(screen==='play-screen')switchTo('detail');else if(screen==='detail')switchTo(lastType);else if(screen!=='home'&&screen!=='pair')switchTo('home');else if(screen==='home'){showExitDialog();}if(e.preventDefault)e.preventDefault();return false;}
 if(screen==='play-screen'&&(key===415||key===19||key===13)){el('play-toggle').click();if(e.preventDefault)e.preventDefault();return false;}
 if((key===37||key===38||key===39||key===40)&&screen!=='play-screen'){
  if(document.activeElement&&document.activeElement.tagName==='INPUT'&&key===37)return;
  directional(key);if(e.preventDefault)e.preventDefault();return false;
 }
 if(key===403){var x=screen==='live'?currentLive:screen==='detail'?selected:null,t=screen==='live'?'live':lastType;if(x&&t)toggleFav(t,x);return;}
 if(key===13&&document.activeElement&&document.activeElement.click&&document.activeElement.tagName!=='INPUT'){
   document.activeElement.click();if(e.preventDefault)e.preventDefault();return false;
 }
}
function installHandlers(){
 var go=document.querySelectorAll('[data-go]'),i;
 for(i=0;i<go.length;i++)go[i].onclick=function(){var id=this.getAttribute('data-go');switchTo(id);if((id==='live'||id==='movies'||id==='series')&&!dataLoaded&&authorized&&!loading)fetchCatalog();};
 el('legal-text').onscroll=legalUpdate;
 el('legal-accept').onclick=function(){if(this.disabled)return;save(LEGAL,'1');switchTo('pair');beginPair();};
 el('pair-retry').onclick=beginPair;
 el('pair-demo').onclick=function(){authorized=false;switchTo('home');updateHero();};
 el('live-search').oninput=function(){drawType('live');};
 el('movies-search').oninput=function(){drawType('movies');};
 el('series-search').oninput=function(){drawType('series');};
 el('detail-back').onclick=function(){switchTo(lastType);};
 el('detail-play').onclick=function(){if(selected)startVOD('movies',selected);};
 el('detail-fav').onclick=function(){if(selected){toggleFav(lastType,selected);say('detail-fav',hasFav(lastType,selected)?'♥ FAVORİDEN ÇIKAR':'♥ FAVORİ');}};
 el('exit-yes').onclick=confirmExit;
 el('exit-no').onclick=dismissExitDialog;
 el('play-stop').onclick=function(){switchTo('detail');};
 el('play-toggle').onclick=function(){var v=el('movie-video');try{if(v.paused)v.play();else v.pause();}catch(e){}};
 el('setting-refresh').onclick=refresh;
 el('setting-exit').onclick=logout;
 el('setting-pin').onclick=function(){var current=read('kuki_vestel_parental_v1')!=='off';save('kuki_vestel_parental_v1',current?'off':'on');say('parent-label',current?'Kapalı':'Açık');toast('Ebeveyn kilidi ayarı kaydedildi. PIN koruması Vestel sürümünde henüz uygulanmadı.');};
 el('setting-lang').onclick=function(){toast('KUKİ PLAYER arayüz dili: Türkçe');};
 el('setting-player').onclick=function(){toast('Vestel oynatıcı: HTML5 video / desteklenirse HLS.js.');};
 el('setting-sub').onclick=function(){toast('Altyazı seçimi, desteklenen medya akışında TV tarayıcısı üzerinden yapılır.');};
 document.onkeydown=onKey;
 el('movie-video').ontimeupdate=function(){var n=Number(this.currentTime)||0,d=Number(this.duration)||0;say('play-time',Math.floor(n/60)+':'+(n%60<10?'0':'')+Math.floor(n%60)+(d?' / '+Math.floor(d/60)+':'+(d%60<10?'0':'')+Math.floor(d%60):''));};
 setInterval(function(){if(screen==='home')tickClock();},60000);
}
function boot(){
 installHandlers();say('parent-label',read('kuki_vestel_parental_v1')==='off'?'Kapalı':'Açık');device=loadDevice();
 if(read(LEGAL)==='1'){switchTo('pair');if(device&&device.activation_code)say('pair-code',device.activation_code);beginPair();}
 else{switchTo('legal');el('legal-text').focus();legalUpdate();}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})(window,document);
