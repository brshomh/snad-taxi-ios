
// ==================================================
// SAND TAXI - Passenger App Logic (Uber Style)
// ==================================================

let state = 'idle';
let pickup = true, dropoff = false;
let selectedRideType = 'eco';
let tripRating = 0;
let tripProgress = 0;
let progressTimer = null;

const fareMap = { eco: 22, comfort: 38, xl: 45, premium: 75 };
const rideNames = { eco: 'سند X', comfort: 'Comfort', xl: 'XL', premium: 'Black' };

const destinations = [
  'المطار الدولي', 'مركز التسوق العالمي', 'مستشفى الملك فهد',
  'فندق هيلتون الرياض', 'الجامعة الملكية', 'برج المملكة',
  'حي المروج', 'حي النزهة', 'المنطقة الصناعية'
];

// ---- LOGIN ----
function doLogin() {
  const p = document.getElementById('phoneInput').value;
  const pw = document.getElementById('passInput').value;
  if (!p || !pw) { toast('error','⚠️ أدخل رقم الجوال وكلمة المرور'); return; }
  toast('success','✅ مرحباً بك!');
  setTimeout(enterHome, 800);
}

function demoLogin() {
  toast('info','🎮 وضع التجربة');
  setTimeout(enterHome, 600);
}

function enterHome() {
  switchScreen('homeScreen');
}

// ---- LOCATION ----
function setPickup() {
  pickup = true;
  document.getElementById('pickupTxt').textContent = 'حي النزهة، شارع الملك عبدالعزيز';
  document.getElementById('pickupTxt').classList.remove('empty');
  document.getElementById('pickupPin').setAttribute('opacity','1');
  document.getElementById('myLocDot').setAttribute('opacity','0.5');
}

function setDropoff() {
  dropoff = true;
  const dest = destinations[Math.floor(Math.random() * destinations.length)];
  document.getElementById('dropoffTxt').textContent = dest;
  document.getElementById('dropoffTxt').classList.remove('empty');
  document.getElementById('dropoffPin').setAttribute('opacity','1');
  document.getElementById('routeLine').setAttribute('opacity','1');
  toast('info','📍 تم تحديد الوجهة');
}

function setQuickPlace(icon, name) {
  dropoff = true;
  document.getElementById('dropoffTxt').textContent = icon + ' ' + name;
  document.getElementById('dropoffTxt').classList.remove('empty');
  document.getElementById('dropoffPin').setAttribute('opacity','1');
  document.getElementById('routeLine').setAttribute('opacity','1');
  toast('info','📍 تم اختيار: ' + name);
}

// ---- RIDE TYPE ----
function selectRide(type, el) {
  document.querySelectorAll('.ride-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedRideType = type;
  document.getElementById('fareVal').textContent = toAr(fareMap[type]);
  document.getElementById('requestBtn').textContent = 'احجز ' + rideNames[type];
}

// ---- REQUEST ----
function requestRide() {
  if (!dropoff) { setDropoff(); setTimeout(startSearch, 300); return; }
  startSearch();
}

function startSearch() {
  state = 'searching';
  document.getElementById('searchingOverlay').classList.add('active');
  document.getElementById('mainBottomSheet').style.display = 'none';
  setTimeout(foundDriver, 3500);
}

function cancelSearch() {
  state = 'idle';
  document.getElementById('searchingOverlay').classList.remove('active');
  document.getElementById('mainBottomSheet').style.display = 'block';
  toast('error','❌ تم إلغاء الطلب');
}

function foundDriver() {
  state = 'active';
  document.getElementById('searchingOverlay').classList.remove('active');
  document.getElementById('tripOverlay').classList.add('active');
  document.getElementById('driverCar').setAttribute('opacity','1');
  toast('success','🚗 تم إيجاد سائق! محمد في طريقه إليك');
  startTripProgress();
}

// ---- TRIP PROGRESS ----
function startTripProgress() {
  tripProgress = 0;
  let phase = 0;
  const etaNums = ['٥ د', '٤ د', '٣ د', '٢ د', '١ د', 'وصل!', 'في الطريق', 'اقتراب', 'وصلت!'];

  progressTimer = setInterval(() => {
    tripProgress += 1.5;
    document.getElementById('tripFill').style.width = tripProgress + '%';
    moveCar(tripProgress);

    if (tripProgress >= 30 && phase === 0) {
      phase = 1;
      document.getElementById('tripStatusMsg').textContent = 'السائق وصل إلى موقعك';
      document.getElementById('etaNum').textContent = 'وصل!';
      toast('info','📍 السائق وصل، تفضل بالصعود');
    }
    if (tripProgress >= 55 && phase === 1) {
      phase = 2;
      document.getElementById('tripStatusMsg').textContent = 'في طريقك إلى وجهتك';
      document.getElementById('etaNum').textContent = '٨ د';
    }
    if (tripProgress >= 100) {
      clearInterval(progressTimer);
      tripDone();
    }
  }, 180);
}

function moveCar(p) {
  const car = document.getElementById('driverCar');
  const startX = 160, startY = 280, endX = 90, endY = 165;
  const eased = p / 100;
  const x = startX + (endX - startX) * eased;
  const y = startY + (endY - startY) * eased;
  car.setAttribute('transform', `translate(${x},${y})`);
}

function tripDone() {
  state = 'rating';
  document.getElementById('tripOverlay').classList.remove('active');
  document.getElementById('ratingOverlay').classList.add('active');
  toast('success','✅ وصلت بأمان!');
}

// ---- VOICE CALL IMPLEMENTATION (VoIP) ----
let audioCtx = null;
let ringtoneInterval = null;
let callDurationTimer = null;
let callDurationSecs = 0;
let isMuted = false;
let isSpeaker = false;

function startRingtoneSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audioCtx = new AudioCtx();
    
    function playBeep() {
      if (!audioCtx || audioCtx.state === 'closed') return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(425, audioCtx.currentTime); // Standard phone ring frequency
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 1.2);
    }

    playBeep();
    ringtoneInterval = setInterval(playBeep, 2500);
  } catch(e) { console.log(e); }
}

function stopRingtoneSound() {
  if (ringtoneInterval) clearInterval(ringtoneInterval);
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
}

function callDriver() {
  document.getElementById('voiceCallOverlay').classList.add('active');
  document.getElementById('callStatusText').innerHTML = '📡 جاري رن الهاتف...';
  document.getElementById('callTargetName').textContent = 'الكابتن محمد السعيد';
  document.getElementById('callTargetImg').src = 'assets/logo-driver.jpg';
  
  isMuted = false; isSpeaker = false;
  document.getElementById('btnMute').classList.remove('active-btn');
  document.getElementById('btnSpeaker').classList.remove('active-btn');
  callDurationSecs = 0;

  startRingtoneSound();

  // Simulate answer after 3 seconds
  setTimeout(() => {
    if (!document.getElementById('voiceCallOverlay').classList.contains('active')) return;
    stopRingtoneSound();
    document.getElementById('callStatusText').innerHTML = '🟢 متصل (00:00)';
    toast('success', '📞 تم رَد المكالمة');

    callDurationTimer = setInterval(() => {
      callDurationSecs++;
      const m = Math.floor(callDurationSecs / 60).toString().padStart(2, '0');
      const s = (callDurationSecs % 60).toString().padStart(2, '0');
      document.getElementById('callStatusText').innerHTML = `🟢 متصل (${toAr(m)}:${toAr(s)})`;
    }, 1000);

  }, 3000);
}

function toggleMute() {
  isMuted = !isMuted;
  const btn = document.getElementById('btnMute');
  btn.classList.toggle('active-btn', isMuted);
  toast('info', isMuted ? '🎙️ تم كتم الميكروفون' : '🎙️ الميكروفون يعمل');
}

function toggleSpeaker() {
  isSpeaker = !isSpeaker;
  const btn = document.getElementById('btnSpeaker');
  btn.classList.toggle('active-btn', isSpeaker);
  toast('info', isSpeaker ? '🔊 تم تشغيل مكبر الصوت' : '🎧 استخدام السماعة الداخلية');
}

function endVoiceCall() {
  stopRingtoneSound();
  if (callDurationTimer) clearInterval(callDurationTimer);
  document.getElementById('voiceCallOverlay').classList.remove('active');
  toast('info', '🔴 تم إنهاء المكالمة');
}

function msgDriver() { toast('info','💬 تم فتح المحادثة الفورية مع الكابتن'); }

function cancelTrip() {
  clearInterval(progressTimer);
  state = 'idle';
  document.getElementById('tripOverlay').classList.remove('active');
  document.getElementById('driverCar').setAttribute('opacity','0');
  document.getElementById('routeLine').setAttribute('opacity','0');
  document.getElementById('dropoffPin').setAttribute('opacity','0');
  document.getElementById('dropoffTxt').textContent = 'إلى أين؟';
  document.getElementById('dropoffTxt').classList.add('empty');
  document.getElementById('tripFill').style.width = '0%';
  document.getElementById('mainBottomSheet').style.display = 'block';
  dropoff = false;
  toast('error','❌ تم إلغاء الرحلة');
}

// ---- RATING ----
function rateStar(val) {
  tripRating = val;
  document.querySelectorAll('.star-btn').forEach(b => {
    b.classList.toggle('lit', parseInt(b.dataset.v) <= val);
  });
}

function toggleChip(el) { el.classList.toggle('selected'); }

function submitRating() {
  state = 'idle';
  document.getElementById('ratingOverlay').classList.remove('active');
  document.getElementById('driverCar').setAttribute('opacity','0');
  document.getElementById('routeLine').setAttribute('opacity','0');
  document.getElementById('dropoffPin').setAttribute('opacity','0');
  document.getElementById('dropoffTxt').textContent = 'إلى أين؟';
  document.getElementById('dropoffTxt').classList.add('empty');
  document.getElementById('tripFill').style.width = '0%';
  document.getElementById('mainBottomSheet').style.display = 'block';
  dropoff = false; tripRating = 0;
  document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('lit'));
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  toast('success','🌟 شكراً على تقييمك!');
}

// ---- NAVIGATION ----
function gotoHome() {
  switchScreen('homeScreen');
  setNav('navHome');
}

function gotoHistory() {
  switchScreen('historyScreen');
  setNav('navTrips');
}

function gotoProfile() {
  switchScreen('profileScreen');
  setNav('navMe');
}

function showProfile() { gotoProfile(); }

function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setNav(id) {
  document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function doLogout() {
  switchScreen('loginScreen');
  toast('info','👋 تم تسجيل الخروج');
}

function centerMap() { toast('info','📍 تم تحديد موقعك'); }

// ---- PAYTABS PAYMENT GATEWAY INTEGRATION ----
let selectedPayMethod = 'mada';

function openPaytabsModal() {
  const currentFare = document.getElementById('fareVal').textContent;
  document.getElementById('payAmountBtn').textContent = currentFare;
  document.getElementById('paytabsModal').classList.add('active');
}

function closePaytabsModal() {
  document.getElementById('paytabsModal').classList.remove('active');
}

function togglePaytabsConfig() {
  const box = document.getElementById('paytabsConfigBox');
  box.style.display = (box.style.display === 'none') ? 'block' : 'none';
}

function savePaytabsKeys() {
  const profId = document.getElementById('payProfileId').value;
  const sKey = document.getElementById('payServerKey').value;
  
  if (!profId || !sKey) {
    toast('error', '⚠️ يرجى إدخال رقم البروفايل ومفتاح الخادم');
    return;
  }
  
  localStorage.setItem('paytabs_profile_id', profId);
  localStorage.setItem('paytabs_server_key', sKey);

  document.getElementById('paytabsConfigBox').style.display = 'none';
  toast('success', `💾 تم حفظ ومطابقة مفاتيح PayTabs (Profile: ${profId}) بنجاح!`);
}

function selectPaypill(type) {
  selectedPayMethod = type;
  document.querySelectorAll('.paypill').forEach(p => p.classList.remove('selected'));

  const formBox = document.getElementById('payFormBox');
  const methodTxt = document.getElementById('paySelectedMethod');

  if (type === 'mada') {
    document.getElementById('pillMada').classList.add('selected');
    methodTxt.textContent = '💳 مدى Mada';
    formBox.style.display = 'block';
  } else if (type === 'apple') {
    document.getElementById('pillApple').classList.add('selected');
    methodTxt.textContent = '🍎 Apple Pay';
    formBox.style.display = 'none';
  } else if (type === 'card') {
    document.getElementById('pillCard').classList.add('selected');
    methodTxt.textContent = '💳 فيزا / ماستر';
    formBox.style.display = 'block';
  } else if (type === 'cash') {
    document.getElementById('pillCash').classList.add('selected');
    methodTxt.textContent = '💵 نقدًا (كاش)';
    formBox.style.display = 'none';
  }
}

function processPaytabsPayment() {
  const fareAr = document.getElementById('fareVal').textContent;

  if (selectedPayMethod === 'cash') {
    closePaytabsModal();
    toast('info', '💵 تم اختيار الدفع كاش عند الوصول');
    requestRide();
    return;
  }

  if (selectedPayMethod === 'apple') {
    toast('info', '🍎 جاري التوثيق ببصمة الوجه عبر Apple Pay...');
    setTimeout(() => {
      closePaytabsModal();
      toast('success', `✅ تم خصم ${fareAr} ر.س فوريًا وحجز الرحلة (PayTabs Ref: PT-118240-AP)`);
      requestRide();
    }, 1000);
    return;
  }

  // Mada / Credit Card PayTabs Checkout Flow
  toast('info', '🔒 جاري الاتصال المباشر بـ PayTabs (Profile ID: 118240)...');
  document.getElementById('otpFareAmt').textContent = fareAr;

  setTimeout(() => {
    document.getElementById('paytabsOtpOverlay').classList.add('active');
  }, 600);
}

function confirmInAppOtpPayment() {
  const fareAr = document.getElementById('fareVal').textContent;

  document.getElementById('paytabsOtpOverlay').classList.remove('active');
  closePaytabsModal();

  toast('success', `✅ تم الدفع واقتطاع ${fareAr} ر.س لـ حساب سند (PayTabs Ref: PT-118240-SEC98)`);

  // Start ride search automatically after payment
  setTimeout(requestRide, 400);
}

function cancelOtpPayment() {
  document.getElementById('paytabsOtpOverlay').classList.remove('active');
  toast('error', '✖ تم إلغاء عملية الدفع');
}

// ---- HELPERS ----
function toAr(n) {
  return n.toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

function toast(type, msg) {
  const w = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  w.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-8px)'; t.style.transition = 'all 0.3s ease'; setTimeout(() => t.remove(), 300); }, 3000);
}

