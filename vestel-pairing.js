/* KUKİ PLAYER / Vestel Foxxum MB230 - V2 pairing client. ES5-compatible. */
(function (window, document) {
  'use strict';
  var ENDPOINT = 'https://jelkfpfpqaialuwhelhd.supabase.co/functions/v1/kuki-device-api';
  var STORAGE_KEY = 'kuki_foxxum_device_identity_v1';
  var device = null;
  var opened = false;
  var busy = false;
  var tick = null;
  var focus = 0;
  var registered = false;
  var lastState = '';
  function el(id) { return document.getElementById(id); }
  function put(id, value) { var e = el(id); if (e) e.textContent = String(value); }
  function validDevice(x) {
    return x && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x.device_id || '') &&
      /^[0-9a-f]{64}$/i.test(x.device_token || '');
  }
  function loadDevice() {
    try { var v = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'); return validDevice(v) ? v : null; }
    catch (e) { return null; }
  }
  function saveDevice(x) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(x)); return true; }
    catch (e) { return false; }
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
    var buttons = [el('pair-retry'), el('pair-back')];
    var i;
    for (i = 0; i < buttons.length; i++) if (buttons[i]) buttons[i].className = 'action pair-action' + (i === focus ? ' sel' : '');
    try { if (buttons[focus]) buttons[focus].focus(); } catch (e) {}
  }
  function stopPolling() { if (tick) { window.clearInterval(tick); tick = null; } }
  function poll() {
    if (!tick) tick = window.setInterval(function () { if (opened && device && !busy && lastState !== 'EŞLEŞTİRME BAŞARILI') check(); }, 30000);
  }
  function http(action, fields, cb) {
    var xhr;
    if (busy || !opened) return;
    busy = true;
    try {
      xhr = new XMLHttpRequest();
      xhr.open('POST', ENDPOINT, true);
      xhr.timeout = 15000;
      xhr.setRequestHeader('Content-Type', 'application/json');
      var done = false;
      function finish(error, data) {
        if (done) return;
        done = true;
        busy = false;
        if (opened) cb(error, data || {});
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        var data;
        try { data = JSON.parse(xhr.responseText || '{}'); }
        catch (e) { return finish('Sunucudan okunabilir yanıt gelmedi.'); }
        if (xhr.status < 200 || xhr.status >= 300 || data.success !== true) {
          return finish(data.message || ('Sunucu hatası (HTTP ' + xhr.status + ').'));
        }
        finish(null, data);
      };
      xhr.onerror = function () { finish('Sunucu bağlantısı kurulamadı. Vestel GitHub Pages adresine API izni (CORS) verilmesi gerekiyor olabilir.'); };
      xhr.ontimeout = function () { finish('Sunucu yanıt vermedi. Ağ bağlantısını kontrol edin.'); };
      var payload = { action: action, platform: 'vestel_foxxum', app_version: 'foxxum-v2-test' };
      var k;
      for (k in fields) if (Object.prototype.hasOwnProperty.call(fields,k)) payload[k] = fields[k];
      xhr.send(JSON.stringify(payload));
    } catch (e) { busy = false; cb('Tarayıcı bağlantısı başlatılamadı.', {}); }
  }
  function check() {
    if (!device || busy) return;
    setState('AKTİVASYON KONTROL EDİLİYOR', 'Kayıt ve eşleştirme durumuna bakılıyor.');
    http('check_activation', { device_id: device.device_id, device_token: device.device_token }, function (error, data) {
      if (error) { setState('BAĞLANTI HATASI', error); return; }
      if (data.activation === 'active') {
        stopPolling();
        setState('EŞLEŞTİRME BAŞARILI', 'Cihaz, merkezi yönetim panelinde etkinleştirildi. Kanal oynatma sonraki test aşamasında eklenecek.', device.activation_code || '');
      } else {
        if (data.activation_code && /^[0-9]{6}$/.test(String(data.activation_code))) {
          device.activation_code = String(data.activation_code);
          saveDevice(device);
        }
        setState('EŞLEŞTİRME BEKLENİYOR', 'Bu altı haneli kodu www.kukiplayer.net yönetim panelindeki cihaz eşleştirme bölümüne girin.', device.activation_code || '');
        poll();
      }
    });
  }
  function register() {
    if (busy) return;
    setState('CİHAZ KAYDEDİLİYOR', 'Güvenli cihaz kaydı oluşturuluyor.', '------');
    http('register_device', {}, function (error, data) {
      if (error) { setState('BAĞLANTI HATASI', error, '------'); return; }
      var next = { device_id: String(data.device_id || ''), device_token: String(data.device_token || ''), activation_code: String(data.activation_code || '') };
      if (!validDevice(next) || !/^[0-9]{6}$/.test(next.activation_code)) {
        setState('SUNUCU YANITI GEÇERSİZ', 'Cihaz kimliği veya kodu beklenen biçimde alınamadı.', '------');
        return;
      }
      device = next;
      registered = true;
      var saved = saveDevice(device);
      setState('EŞLEŞTİRME BEKLENİYOR',
        'Kodu www.kukiplayer.net yönetim panelinde girin.' + (saved ? '' : ' Uyarı: TV yerel kayıt izni vermediği için uygulama kapanınca kod değişebilir.'),
        device.activation_code);
      poll();
    });
  }
  function tryNow() {
    if (busy || !opened) return;
    if (!device) device = loadDevice();
    if (device) check(); else register();
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
    if (code === 37 || code === 38) { setFocus(focus === 0 ? 1 : 0); return; }
    if (code === 39 || code === 40) { setFocus(focus === 0 ? 1 : 0); return; }
    if (code === 13) {
      if (focus === 0) tryNow();
      else if (window.KUKIReturnHome) window.KUKIReturnHome();
    }
  }
  function wire() {
    var retry = el('pair-retry'), back = el('pair-back');
    if (retry) retry.onclick = function () { setFocus(0); tryNow(); };
    if (back) back.onclick = function () { if (window.KUKIReturnHome) window.KUKIReturnHome(); };
  }
  window.KUKIVestelPairing = { open: open, close: close, key: key, init: wire };
})(window, document);
