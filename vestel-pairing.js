/* KUKİ PLAYER Foxxum MB230 / V2.4 — stable device identity, manual code renewal. ES5. */
(function (window, document) {
  'use strict';
  var ENDPOINT = 'https://jelkfpfpqaialuwhelhd.supabase.co/functions/v1/kuki-device-api';
  var STORAGE_KEY = 'kuki_foxxum_device_identity_v1';
  var STORE=STORAGE_KEY, IDB_NAME='kuki_foxxum_identity_v1', IDB_STORE='identity';
  var idChecked=false, recovering=false, attempted=false, deletedOnServer=false;
  var device = null;
  var opened = false;
  var busy = false;
  var tick = null;
  var focus = 0;
  var registered = false;
  var lastState = '';
  function save(k,v) { try { window.localStorage.setItem(k,v);return true; } catch(e) { return false; } }
  function read(k) { try { return window.localStorage.getItem(k)||''; } catch(e) { return ''; } }
  function del(k) { try { window.localStorage.removeItem(k); } catch(e) {} }
  function el(id) { return document.getElementById(id); }
  function put(id, value) { var e = el(id); if (e) e.textContent = String(value); }
  function validDevice(x) {
    return x && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x.device_id || '') &&
      /^[0-9a-f]{64}$/i.test(x.device_token || '');
  }
  function loadDevice(){
   var v=null,raw=read(STORE);
   if(!raw){try{raw=window.sessionStorage.getItem(STORE)||'';}catch(e){}}
   try{v=JSON.parse(raw);}catch(e){}
   return validDevice(v)?v:null;
  }
  function localStoreOK(){
   var k='kuki_foxxum_store_probe_v1';
   try{window.localStorage.setItem(k,'1');var ok=window.localStorage.getItem(k)==='1';window.localStorage.removeItem(k);return ok;}catch(e){return false;}
  }
  function idb(op,value,cb){
   var db=null,req,done=false,timeout;
   function finish(result){
    if(done)return;done=true;if(timeout)clearTimeout(timeout);
    if(db)try{db.close();}catch(e){}
    cb(result);
   }
   if(!window.indexedDB){cb(op==='read'?null:false);return;}
   try{
    req=window.indexedDB.open(IDB_NAME,1);
    timeout=setTimeout(function(){finish(op==='read'?null:false);},2700);
    req.onupgradeneeded=function(){
     try{if(!req.result.objectStoreNames.contains(IDB_STORE))req.result.createObjectStore(IDB_STORE);}catch(e){}
    };
    req.onerror=function(){finish(op==='read'?null:false);};
    req.onblocked=function(){finish(op==='read'?null:false);};
    req.onsuccess=function(){
     if(done){try{req.result.close();}catch(e){}return;}
     db=req.result;
     try{
      var tx=db.transaction([IDB_STORE],op==='read'?'readonly':'readwrite');
      var r=op==='read'?tx.objectStore(IDB_STORE).get('current'):tx.objectStore(IDB_STORE).put(value,op==='probe'?'probe':'current');
      if(op==='read')r.onsuccess=function(){finish(validDevice(r.result)?r.result:null);};
      else tx.oncomplete=function(){finish(true);};
      r.onerror=function(){finish(op==='read'?null:false);};
      tx.onabort=function(){finish(op==='read'?null:false);};
     }catch(e){finish(op==='read'?null:false);}
    };
   }catch(e){finish(op==='read'?null:false);}
  }
  function persistIdentity(value,cb){
   var raw=JSON.stringify(value),local=save(STORE,raw)&&read(STORE)===raw;
   try{window.sessionStorage.setItem(STORE,raw);}catch(e){}
   idb('write',value,function(ok){cb(local||ok);});
  }
  function rememberDevice(cb){
   if(!device)device=loadDevice();
   if(device){persistIdentity(device,function(){cb();});return;}
   idb('read',null,function(value){
    if(value){device=value;var raw=JSON.stringify(value);save(STORE,raw);try{window.sessionStorage.setItem(STORE,raw);}catch(e){}}
    cb();
   });
  }
  function storageAvailable(cb){
   if(localStoreOK()){cb(true);return;}
   idb('probe','1',function(ok){cb(ok);});
  }
  function forgetIdentity(cb){
   del(STORE);try{window.sessionStorage.removeItem(STORE);}catch(e){}
   idb('write',null,function(){cb();});
  }
  function setState(label, detail, code) {
    if (!opened) return;
    lastState = label;
    put('pair-state', label);
    put('pair-note', detail);
    if (typeof code !== 'undefined') put('pair-code', code || '------');
  }
  function setFocus(n) {
    focus = n;
    var buttons = [el('pair-retry'), el('pair-new-code'), el('pair-back')];
    var i;
    for (i = 0; i < buttons.length; i++) if (buttons[i]) buttons[i].className = 'action pair-action' + (i === focus ? ' sel' : '');
    try { if (buttons[focus]) buttons[focus].focus(); } catch (e) {}
  }
  function stopPolling() { if (tick) { window.clearInterval(tick); tick = null; } }
  function poll() {
    if (!tick) tick = window.setInterval(function () { if (opened && device && !busy && lastState !== 'EŞLEŞTİRME BAŞARILI') check(); }, 30000);
  }
  // OMI 4.13 can emit readyState=4 before exposing the final response body.
  // Prefer onload and defer readyState parsing; never print device tokens.
  function http(action, fields, cb) {
    if (busy || !opened) return;
    busy = true;
    var xhr;
    var completed = false;
    var timeoutHandle = null;
    function finish(error, data) {
      if (completed) return;
      completed = true;
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
      busy = false;
      if (opened) cb(error, data || {});
    }
    function parseResponse() {
      if (completed) return;
      var status = 0, raw = '', data = null;
      try { status = xhr.status || 0; } catch (e) {}
      try { raw = xhr.responseText || ''; }
      catch (readError) {
        finish('TV sunucu yanıtını okuyamıyor (HTTP ' + status + '). Tarayıcı erişim izni sorunu olabilir.');
        return;
      }
      raw = String(raw).replace(/^\uFEFF/, '').replace(/^\s+|\s+$/g, '');
      if (!raw) {
        finish('Sunucu yanıtı TV üzerinde boş görünüyor (HTTP ' + status + ').');
        return;
      }
      try { data = JSON.parse(raw); }
      catch (parseError) {
        finish('Sunucu HTTP ' + status + ' ile yanıtladı; TV JSON verisini çözemedi (' + raw.length + ' karakter).');
        return;
      }
      if (status < 200 || status >= 300 || !data || data.success !== true) {
        finish(data && data.message ? data.message : ('API hatası: HTTP ' + status));
        return;
      }
      finish(null, data);
    }
    try {
      xhr = new XMLHttpRequest();
      xhr.open('POST', ENDPOINT, true);
      try { xhr.timeout = 18000; } catch (e) {}
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.onload = parseResponse;
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) window.setTimeout(parseResponse, 150);
      };
      xhr.onerror = function () { finish('TV sunucu yanıtını alamadı. Bağlantı veya tarayıcı erişim izni sorunu (CORS).'); };
      xhr.ontimeout = function () { finish('Sunucu yanıtı TV’ye ulaşmadı (zaman aşımı).'); };
      timeoutHandle = window.setTimeout(function () {
        if (completed) return;
        try { xhr.abort(); } catch (e) {}
        finish('18 saniyede yanıt tamamlanamadı. TV ağ bağlantısını kontrol edin.');
      }, 19000);
      var payload = {action: action, platform: 'vestel_foxxum', app_version: 'foxxum-v2.4-test'};
      var k;
      for (k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)) payload[k] = fields[k];
      xhr.send(JSON.stringify(payload));
    } catch (e) { finish('Eski TV tarayıcısı ağ isteğini başlatamadı.', {}); }
  }
  function check() {
    if (!device || busy) return;
    setState('AKTİVASYON KONTROL EDİLİYOR', 'Mevcut cihaz kodu ve eşleştirme durumu sorgulanıyor.');
    http('check_activation', { device_id: device.device_id, device_token: device.device_token }, function (error, data) {
      if (error) {
        if (String(error).indexOf('Cihaz kaydı silinmiş') >= 0) {
          deletedOnServer = true;
          setState('ESKİ KAYIT SİLİNMİŞ', 'Bu cihazın eski kaydı kaldırılmış. YENİ KOD AL seçeneğini kullanın.', device.activation_code || '');
          return;
        }
        setState('BAĞLANTI HATASI', error, device.activation_code || '');
        return;
      }
      deletedOnServer = false;
      if (data.activation === 'active') {
        stopPolling();
        setState('EŞLEŞTİRME BAŞARILI', 'Cihaz aktifleştirildi. Kanal oynatma V4.2 TV sürümünde kullanılabilir.', device.activation_code || '');
        return;
      }
      if (data.activation_code && /^[0-9]{6}$/.test(String(data.activation_code))) {
        if (device.activation_code !== String(data.activation_code)) {
          device.activation_code = String(data.activation_code);
          persistIdentity(device, function(){});
        }
      } else {
        setState('GEÇERSİZ KOD', 'Sunucu geçerli kod göndermedi. YENİ KOD AL seçeneğini kullanın.', device.activation_code || '');
        return;
      }
      setState('EŞLEŞTİRME BEKLENİYOR', '6 haneli kodu www.kukiplayer.net adresinden aktifleştirin.', device.activation_code || '');
      poll();
    });
  }
  function register() {
    if (busy) return;
    setState('CİHAZ KAYDEDİLİYOR', 'Cihazın ilk güvenli kaydı oluşturuluyor.', '------');
    http('register_device', {}, function(error,data) {
      if (error) {
        setState('BAĞLANTI HATASI', error, '------');
        return;
      }
      var next = {
        device_id: String(data.device_id || ''),
        device_token: String(data.device_token || ''),
        activation_code: String(data.activation_code || '')
      };
      if (!validDevice(next) || !/^[0-9]{6}$/.test(next.activation_code)) {
        setState('GEÇERSİZ YANIT','Cihaz bilgileri beklenen biçimde gelmedi. Tekrar otomatik kayıt yapılmayacak.','------');
        return;
      }
      device=next;
      registered=true;
      persistIdentity(device,function(saved) {
        setState(saved ? 'EŞLEŞTİRME BEKLENİYOR' : 'DEPOLAMA HATASI',
          saved ? 'Kodu www.kukiplayer.net üzerinden etkinleştirin. Kod tekrar açılışta korunur.' :
            'TV kalıcı cihaz kimliğini yazamadı. Web App Tester depolamasını kontrol edin.',
          device.activation_code);
        if (saved) poll();
      });
    });
  }
  function tryNow() {
    if (busy || !opened || recovering) return;
    if (!idChecked) {
      idChecked=true;recovering=true;
      rememberDevice(function(){recovering=false;if(opened)tryNow();});
      return;
    }
    if (!device) device=loadDevice();
    if (device) {
      if (device.activation_code) put('pair-code',device.activation_code);
      check();
      return;
    }
    if (attempted) {
      setState('YENİ KAYIT DURDURULDU', 'Bu oturumda kayıt denendi. Gereksiz kod oluşmaması için tekrar otomatik kayıt yapılmayacak.','------');
      return;
    }
    attempted=true;
    recovering=true;
    storageAvailable(function(ok){
      recovering=false;
      if (!opened) return;
      if (!ok) {
        setState('DEPOLAMA İZNİ YOK', 'TV kalıcı depolamaya izin vermedi. Yeni kod oluşturulmadı.', '------');
        return;
      }
      register();
    });
  }
  function newCode() {
    if (busy || recovering || !opened) return;
    var prompt = 'YENİ KOD AL: Mevcut hesabın bağlantısı kaldırılabilir. Devam edilsin mi?';
    if (!window.confirm(prompt)) return;
    stopPolling();
    if (!device) {
      attempted=false;
      tryNow();
      return;
    }
    if (deletedOnServer) {
      recovering=true;
      forgetIdentity(function(){
        recovering=false;device=null;deletedOnServer=false;attempted=false;
        tryNow();
      });
      return;
    }
    setState('YENİ KOD İSTENİYOR', 'Mevcut cihaz kimliği korunarak yeni kod isteniyor.', device.activation_code || '');
    http('reset_pairing', { device_id: device.device_id, device_token: device.device_token }, function(error,data) {
      if (error) {
        setState('YENİ KOD HATASI', error, device.activation_code || '');
        return;
      }
      if (!/^[0-9]{6}$/.test(String(data.activation_code || ''))) {
        setState('YENİ KOD HATASI','Sunucu geçerli kod göndermedi.',device.activation_code||'');
        return;
      }
      device.activation_code=String(data.activation_code);
      persistIdentity(device,function(saved){
        setState(saved?'YENİ KOD HAZIR':'DEPOLAMA HATASI',
          saved?'Yeni kodu www.kukiplayer.net adresinden aktifleştirin.':'TV yeni kodu kalıcı hafızaya yazamadı.',
          device.activation_code);
        if(saved)poll();
      });
    });
  }
  function open() {
    opened = true;
    setFocus(0);
    if (!device) device = loadDevice();
    if (device && device.activation_code) put('pair-code', device.activation_code);
    tryNow();
  }
  function close() { opened = false; stopPolling(); }
  function key(code) {
    if (code===37||code===38) { setFocus((focus+2)%3); return; }
    if (code===39||code===40) { setFocus((focus+1)%3); return; }
    if (code===13) {
      if (focus===0) tryNow();
      else if (focus===1) newCode();
      else if (window.KUKIReturnHome) window.KUKIReturnHome();
    }
  }
  function wire() {
    var retry=el('pair-retry'), renew=el('pair-new-code'),back=el('pair-back');
    if(retry)retry.onclick=function(){setFocus(0);tryNow();};
    if(renew)renew.onclick=function(){setFocus(1);newCode();};
    if(back)back.onclick=function(){if(window.KUKIReturnHome)window.KUKIReturnHome();};
  }
  window.KUKIVestelPairing = { open: open, close: close, key: key, init: wire };
})(window, document);
