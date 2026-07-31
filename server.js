const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ===================================================
// PayTabs Configuration - مفاتيح مؤسسة سند الحقيقية
// ===================================================
const PAYTABS_CONFIG = {
  profileId: '118240',
  serverKey: 'SRJNKJHRB6-JKZW2KGMRH-BR6DNM2DLM',
  clientKey: 'CHKM79-V92P6K-9VMKTN-QVR79N',
  region: 'SAU',
  baseUrl: 'https://secure.paytabs.sa',
  publicUrl: 'https://snad-taxi.loca.lt'   // رابط عام لاستقبال PayTabs callbacks
};

// ===================================================
// POST /api/pay - إنشاء عملية دفع جديدة عبر PayTabs
// ===================================================
app.post('/api/pay', async (req, res) => {
  const { amount, currency, description, customerName, customerEmail, customerPhone } = req.body;

  if (!amount || !currency) {
    return res.status(400).json({ error: 'المبلغ والعملة مطلوبان' });
  }

  const paymentPayload = {
    profile_id: parseInt(PAYTABS_CONFIG.profileId),
    tran_type: 'sale',
    tran_class: 'ecom',
    cart_id: 'SNAD-' + Date.now(),
    cart_description: description || 'رحلة سند تاكسي',
    cart_currency: currency || 'SAR',
    cart_amount: parseFloat(amount),
    callback: `${PAYTABS_CONFIG.publicUrl}/api/callback`,
    return: `${PAYTABS_CONFIG.publicUrl}/payment-success.html`,
    customer_details: {
      name: customerName || 'عميل سند',
      email: customerEmail || 'customer@snad.sa',
      phone: customerPhone || '+966500000000',
      street1: 'الرياض',
      city: 'الرياض',
      state: 'الرياض',
      country: 'SA',
      zip: '12345'
    },
    shipping_details: {
      name: customerName || 'عميل سند',
      email: customerEmail || 'customer@snad.sa',
      phone: customerPhone || '+966500000000',
      street1: 'الرياض',
      city: 'الرياض',
      state: 'الرياض',
      country: 'SA',
      zip: '12345'
    }
  };

  try {
    const response = await fetch(`${PAYTABS_CONFIG.baseUrl}/payment/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': PAYTABS_CONFIG.serverKey
      },
      body: JSON.stringify(paymentPayload)
    });

    const data = await response.json();
    
    if (data.redirect_url) {
      res.json({ 
        success: true,
        paymentUrl: data.redirect_url,
        tranRef: data.tran_ref
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: data.message || 'فشل إنشاء عملية الدفع',
        details: data
      });
    }
  } catch (err) {
    console.error('PayTabs Error:', err);
    res.status(500).json({ error: 'خطأ في الاتصال بـ PayTabs: ' + err.message });
  }
});

// ===================================================
// POST /api/pay-token - شحن باستخدام PayLib Token
// يستقبل token من PayTabs Managed Form ويُنهي الدفع
// ===================================================
app.post('/api/pay-token', async (req, res) => {
  const { token, tranRef, amount, currency, holderName } = req.body;

  if (!token || !amount) {
    return res.status(400).json({ error: 'token والمبلغ مطلوبان' });
  }

  console.log(`\n🔑 Token Payment Request:`);
  console.log(`   Token: ${token.substring(0,20)}...`);
  console.log(`   Amount: ${amount} ${currency || 'SAR'}`);

  const tokenPayload = {
    profile_id: parseInt(PAYTABS_CONFIG.profileId),
    tran_type:  'sale',
    tran_class: 'ecom',
    cart_id:    'SNAD-T-' + Date.now(),
    cart_description: 'رحلة سند تاكسي',
    cart_currency: currency || 'SAR',
    cart_amount:   parseFloat(amount),
    payment_token: token,
    customer_details: {
      name:    holderName || 'عميل سند',
      email:   'customer@snad.sa',
      phone:   '+966500000000',
      street1: 'الرياض',
      city:    'الرياض',
      state:   'الرياض',
      country: 'SA',
      zip:     '12345'
    },
    callback: `${PAYTABS_CONFIG.publicUrl}/api/callback`,
    return:   `${PAYTABS_CONFIG.publicUrl}/payment-success.html`
  };

  try {
    const response = await fetch(`${PAYTABS_CONFIG.baseUrl}/payment/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': PAYTABS_CONFIG.serverKey
      },
      body: JSON.stringify(tokenPayload)
    });

    const data = await response.json();
    console.log('Token Charge Response:', JSON.stringify(data, null, 2));

    const status  = data.payment_result?.response_status;
    const respMsg = data.payment_result?.response_message;

    if (status === 'A') {
      console.log(`✅ Token Charge SUCCESS: ${data.tran_ref}`);
      return res.json({ success: true, direct: true, tranRef: data.tran_ref, message: respMsg });

    } else if (data.redirect_url) {
      console.log(`🔐 3DS required after token: ${data.tran_ref}`);
      return res.json({ success: true, requires3DS: true, paymentUrl: data.redirect_url, tranRef: data.tran_ref });

    } else {
      console.log(`❌ Token Charge FAILED: ${respMsg}`);
      return res.status(400).json({ success: false, error: respMsg || data.message || 'فشل الشحن' });
    }

  } catch (err) {
    console.error('Token Charge Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===================================================
// POST /api/pay-direct - دفع مباشر بالبطاقة داخل التطبيق
// Card data → PayTabs API → نتيجة فورية (بدون redirect)
// ===================================================
app.post('/api/pay-direct', async (req, res) => {
  const {
    amount, currency, description,
    cardNumber, expiryMonth, expiryYear, cvv, holderName,
    customerName, customerEmail, customerPhone
  } = req.body;

  // التحقق من الحقول المطلوبة
  if (!amount || !cardNumber || !expiryMonth || !expiryYear || !cvv) {
    return res.status(400).json({ error: 'جميع بيانات البطاقة مطلوبة' });
  }

  // تنظيف رقم البطاقة من المسافات
  const cleanCard = cardNumber.replace(/\s+/g, '');

  const directPayload = {
    profile_id: parseInt(PAYTABS_CONFIG.profileId),
    tran_type: 'sale',
    tran_class: 'ecom',
    cart_id: 'SNAD-' + Date.now(),
    cart_description: description || 'رحلة سند تاكسي',
    cart_currency: currency || 'SAR',
    cart_amount: parseFloat(amount),
    paypage_lang: 'ar',
    payment_info: {
      card_number: cleanCard,
      expiry_month: expiryMonth.toString().padStart(2, '0'),
      expiry_year: expiryYear.toString(),
      cvv: cvv.toString()
    },
    customer_details: {
      name: holderName || customerName || 'عميل سند',
      email: customerEmail || 'customer@snad.sa',
      phone: customerPhone || '+966500000000',
      street1: 'الرياض',
      city: 'الرياض',
      state: 'الرياض',
      country: 'SA',
      zip: '12345'
    },
    callback: `${PAYTABS_CONFIG.publicUrl}/api/callback`,
    return: `${PAYTABS_CONFIG.publicUrl}/payment-success.html`
  };

  console.log(`\n💳 Direct Card Payment Request:`);
  console.log(`   Amount: ${amount} SAR`);
  console.log(`   Card: **** **** **** ${cleanCard.slice(-4)}`);

  try {
    const response = await fetch(`${PAYTABS_CONFIG.baseUrl}/payment/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': PAYTABS_CONFIG.serverKey
      },
      body: JSON.stringify(directPayload)
    });

    const data = await response.json();
    console.log('PayTabs Response:', JSON.stringify(data, null, 2));

    // تحقق من النتيجة
    const status = data.payment_result?.response_status;
    const respMsg = data.payment_result?.response_message;

    if (status === 'A') {
      // ✅ الدفع تم مباشرة (Authorized)
      console.log(`✅ Direct Payment SUCCESS: ${data.tran_ref}`);
      return res.json({
        success: true,
        direct: true,
        tranRef: data.tran_ref,
        message: respMsg || 'تم الدفع بنجاح'
      });
    } else if (data.redirect_url) {
      // 🔐 يحتاج 3D Secure — نرجع الرابط للتطبيق
      console.log(`🔐 3DS Required: ${data.tran_ref}`);
      return res.json({
        success: true,
        direct: false,
        requires3DS: true,
        paymentUrl: data.redirect_url,
        tranRef: data.tran_ref,
        message: '3D Secure مطلوب'
      });
    } else {
      // ❌ رُفض
      console.log(`❌ Payment FAILED: ${respMsg}`);
      return res.status(400).json({
        success: false,
        error: respMsg || data.message || 'تم رفض البطاقة',
        details: data
      });
    }
  } catch (err) {
    console.error('Direct Pay Error:', err);
    res.status(500).json({ error: 'خطأ في الاتصال: ' + err.message });
  }
});


// ===================================================
// POST /api/callback - PayTabs يتصل بهذا بعد الدفع
// ===================================================
app.post('/api/callback', async (req, res) => {
  console.log('PayTabs Callback:', JSON.stringify(req.body, null, 2));
  
  const { tran_ref, payment_result } = req.body;
  
  if (payment_result && payment_result.response_status === 'A') {
    console.log(`✅ دفع ناجح: ${tran_ref}`);
  } else {
    console.log(`❌ دفع فاشل: ${tran_ref}`);
  }
  
  res.sendStatus(200);
});

// ===================================================
// POST /api/verify - التحقق من حالة الدفع
// ===================================================
app.post('/api/verify', async (req, res) => {
  const { tranRef } = req.body;
  if (!tranRef) return res.status(400).json({ error: 'tranRef مطلوب' });

  try {
    const response = await fetch(`${PAYTABS_CONFIG.baseUrl}/payment/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': PAYTABS_CONFIG.serverKey
      },
      body: JSON.stringify({
        profile_id: parseInt(PAYTABS_CONFIG.profileId),
        tran_ref: tranRef
      })
    });
    const data = await response.json();

    console.log(`🔍 Verify ${tranRef}:`, JSON.stringify(data, null, 2));

    const status  = data.payment_result?.response_status;
    const message = data.payment_result?.response_message;

    // A = Authorized, H = Hold, P = Pending, D = Declined
    res.json({
      success: status === 'A' || status === 'H',
      status:  status || 'U',
      message: message || data.message || 'غير معروف',
      tranRef: data.tran_ref || tranRef,
      raw:     data
    });

  } catch (err) {
    console.error('Verify Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===================================================
// POST /api/keys - حفظ مفاتيح PayTabs في الذاكرة
// ===================================================
app.post('/api/keys', (req, res) => {
  const { profileId, serverKey } = req.body;
  if (!profileId || !serverKey) {
    return res.status(400).json({ error: 'profileId و serverKey مطلوبان' });
  }
  PAYTABS_CONFIG.profileId = profileId;
  PAYTABS_CONFIG.serverKey = serverKey;
  console.log(`✅ تم تحديث مفاتيح PayTabs - Profile ID: ${profileId}`);
  res.json({ success: true, message: 'تم حفظ المفاتيح بنجاح' });
});

// ===================================================
// صفحة نجاح الدفع
// ===================================================
app.get('/payment-success.html', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><title>تم الدفع - سند</title>
<style>
  body { font-family: 'Cairo', sans-serif; background: #000; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; }
  .box { padding: 40px; }
  .icon { font-size: 80px; margin-bottom: 20px; }
  h1 { font-size: 28px; margin-bottom: 10px; }
  p { color: #aaa; }
  .ref { font-size: 12px; color: #555; margin-top: 20px; }
</style>
</head>
<body>
<div class="box">
  <div class="icon">✅</div>
  <h1>تم الدفع بنجاح!</h1>
  <p>سيبدأ السائق التوجه إليك الآن</p>
  <div class="ref" id="ref"></div>
</div>
<script>
  const p = new URLSearchParams(location.search);
  const ref = p.get('tranRef') || p.get('tran_ref') || '';
  if (ref) document.getElementById('ref').textContent = 'رقم المعاملة: ' + ref;
  setTimeout(() => { window.close(); }, 5000);
</script>
</body>
</html>`);
});


// ===================================================
// 🧠 محرك الذكاء الاصطناعي للإشعارات والعروض الذكية
// AI Smart Notification & Offers Engine
// ===================================================

// قاعدة بيانات مؤقتة في الذاكرة (تُستبدل بـ Firebase في الإنتاج)
const smartDB = {
  drivers: {},    // { driverId: { lastTrip, totalTrips, location, fcmToken, isOnline } }
  passengers: {}, // { passengerId: { lastTrip, totalTrips, cancelledTrips, fcmToken } }
  sentNotifications: [], // سجل الإشعارات المُرسلة
  offers: []             // العروض النشطة
};

// ===== تسجيل FCM Token للجهاز =====
app.post('/api/smart/register', (req, res) => {
  const { userId, role, fcmToken, location } = req.body;
  if (!userId || !fcmToken) return res.status(400).json({ error: 'userId و fcmToken مطلوبان' });

  if (role === 'driver') {
    smartDB.drivers[userId] = { ...(smartDB.drivers[userId] || {}), fcmToken, location, lastSeen: Date.now() };
  } else {
    smartDB.passengers[userId] = { ...(smartDB.passengers[userId] || {}), fcmToken, lastSeen: Date.now() };
  }
  res.json({ success: true, message: `تم تسجيل ${userId} في نظام الإشعارات` });
});

// ===== تحديث نشاط السائق =====
app.post('/api/smart/driver-activity', (req, res) => {
  const { driverId, isOnline, tripCompleted, location } = req.body;
  if (!driverId) return res.status(400).json({ error: 'driverId مطلوب' });

  smartDB.drivers[driverId] = smartDB.drivers[driverId] || {};
  const d = smartDB.drivers[driverId];

  if (tripCompleted) {
    d.lastTrip = Date.now();
    d.totalTrips = (d.totalTrips || 0) + 1;
  }
  if (isOnline !== undefined) d.isOnline = isOnline;
  if (location) d.location = location;
  d.lastSeen = Date.now();

  res.json({ success: true });
});

// ===== تحديث نشاط الراكب =====
app.post('/api/smart/passenger-activity', (req, res) => {
  const { passengerId, action } = req.body; // action: 'request', 'cancel', 'complete'
  if (!passengerId) return res.status(400).json({ error: 'passengerId مطلوب' });

  smartDB.passengers[passengerId] = smartDB.passengers[passengerId] || {};
  const p = smartDB.passengers[passengerId];

  if (action === 'request') p.lastRequest = Date.now();
  if (action === 'cancel') {
    p.cancelledTrips = (p.cancelledTrips || 0) + 1;
    p.lastCancel = Date.now();
  }
  if (action === 'complete') {
    p.totalTrips = (p.totalTrips || 0) + 1;
    p.lastTrip = Date.now();
  }

  res.json({ success: true });
});

// ===== إرسال إشعار مخصص يدوياً (من لوحة التحكم) =====
app.post('/api/smart/send-notification', async (req, res) => {
  const { target, title, body, offer } = req.body;
  // target: 'all_drivers' | 'all_passengers' | 'all' | userId

  let tokens = [];

  if (target === 'all_drivers' || target === 'all') {
    tokens.push(...Object.values(smartDB.drivers).map(d => d.fcmToken).filter(Boolean));
  }
  if (target === 'all_passengers' || target === 'all') {
    tokens.push(...Object.values(smartDB.passengers).map(p => p.fcmToken).filter(Boolean));
  }
  if (target && target !== 'all' && target !== 'all_drivers' && target !== 'all_passengers') {
    const driver = smartDB.drivers[target];
    const passenger = smartDB.passengers[target];
    if (driver?.fcmToken) tokens.push(driver.fcmToken);
    if (passenger?.fcmToken) tokens.push(passenger.fcmToken);
  }

  // تسجيل الإشعار
  const notification = { target, title, body, offer, sentAt: Date.now(), tokens: tokens.length };
  smartDB.sentNotifications.push(notification);

  // في الإنتاج: إرسال عبر FCM API
  // await sendFCMNotification(tokens, title, body);

  res.json({ success: true, tokensTargeted: tokens.length, notification });
});

// ===== جلب إحصائيات لوحة التحكم الذكية =====
app.get('/api/smart/stats', (req, res) => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  const activeDrivers = Object.values(smartDB.drivers).filter(d => d.isOnline).length;
  const inactiveDrivers = Object.values(smartDB.drivers).filter(d => !d.isOnline && d.lastSeen && now - d.lastSeen < 2 * oneHour).length;
  const recentCancels = Object.values(smartDB.passengers).filter(p => p.lastCancel && now - p.lastCancel < oneHour).length;

  res.json({
    totalDrivers: Object.keys(smartDB.drivers).length,
    activeDrivers,
    inactiveDrivers,
    totalPassengers: Object.keys(smartDB.passengers).length,
    recentCancels,
    sentNotifications: smartDB.sentNotifications.length,
    activeOffers: smartDB.offers.filter(o => o.expiresAt > now).length,
    lastActivity: new Date().toLocaleString('ar-SA')
  });
});

// ===== إدارة العروض =====
app.post('/api/smart/offers', (req, res) => {
  const { title, discount, target, durationMinutes } = req.body;
  const offer = {
    id: 'OFFER_' + Date.now(),
    title,
    discount,
    target,
    createdAt: Date.now(),
    expiresAt: Date.now() + (durationMinutes || 60) * 60 * 1000
  };
  smartDB.offers.push(offer);
  res.json({ success: true, offer });
});

app.get('/api/smart/offers/active', (req, res) => {
  const now = Date.now();
  res.json({ offers: smartDB.offers.filter(o => o.expiresAt > now) });
});

// ===== المحرك الذكي التلقائي (يعمل كل دقيقة) =====
const SMART_ENGINE_INTERVAL = 60 * 1000; // كل دقيقة

setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const twoHours = 2 * oneHour;

  // --- تحليل السائقين ---
  Object.entries(smartDB.drivers).forEach(([driverId, driver]) => {
    if (!driver.fcmToken) return;

    // سائق متصل لأكثر من ساعة بدون رحلة → اقترح منطقة مزدحمة
    if (driver.isOnline && driver.lastTrip && now - driver.lastTrip > twoHours) {
      const suggestion = analyzeHotZone();
      const notification = {
        target: driverId,
        title: '📍 منطقة مزدحمة قريبة منك!',
        body: `الطلب مرتفع في ${suggestion}. توجه الآن لزيادة أرباحك 🚗`,
        sentAt: now,
        auto: true
      };
      smartDB.sentNotifications.push(notification);
      console.log(`[AI Engine] 📳 إشعار للسائق ${driverId}: ${notification.body}`);
    }

    // ساعات الذروة → إشعار ارتفاع الأجرة
    const hour = new Date().getHours();
    if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
      if (!driver.peakNotifiedAt || now - driver.peakNotifiedAt > oneHour) {
        const notification = {
          target: driverId,
          title: '⚡ وقت الذروة - الأجرة أعلى!',
          body: 'الطلب مرتفع الآن، الأجرة أعلى بـ30% في هذه الساعة 💰',
          sentAt: now,
          auto: true
        };
        smartDB.sentNotifications.push(notification);
        driver.peakNotifiedAt = now;
        console.log(`[AI Engine] ⚡ إشعار ذروة للسائق ${driverId}`);
      }
    }
  });

  // --- تحليل الركاب ---
  Object.entries(smartDB.passengers).forEach(([passengerId, passenger]) => {
    if (!passenger.fcmToken) return;

    // راكب ألغى طلباً في آخر ساعة → عرض خصم
    if (passenger.lastCancel && now - passenger.lastCancel < oneHour && !passenger.cancelOfferSent) {
      const notification = {
        target: passengerId,
        title: '🎁 عرض خاص لك!',
        body: 'نلاحظ أنك أنهيت طلبك مبكراً. اطلب الآن واحصل على خصم 15% 🎉',
        sentAt: now,
        auto: true,
        offer: { discount: 15, expiresInMinutes: 15 }
      };
      smartDB.sentNotifications.push(notification);
      passenger.cancelOfferSent = true;
      setTimeout(() => { passenger.cancelOfferSent = false; }, 60 * 60 * 1000);
      console.log(`[AI Engine] 🎁 عرض استرداد للراكب ${passengerId}`);
    }
  });

}, SMART_ENGINE_INTERVAL);

// دالة مساعدة لتحليل أكثر المناطق ازدحاماً (محاكاة ذكية)
function analyzeHotZone() {
  const zones = ['حي الملز', 'العليا', 'الملقا', 'الروضة', 'الوزارات', 'المطار', 'العمارية'];
  const hour = new Date().getHours();
  if (hour >= 6 && hour <= 9) return 'محيط المطار والوزارات';
  if (hour >= 12 && hour <= 14) return 'مراكز التسوق والمطاعم';
  if (hour >= 16 && hour <= 19) return 'الأحياء السكنية والمجمعات';
  return zones[Math.floor(Math.random() * zones.length)];
}

console.log('🧠 [AI Engine] تم تشغيل محرك الذكاء الاصطناعي للإشعارات الذكية');

// ===================================================

const PORT = 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('🚗 ====================================');
  console.log('   خادم سند تاكسي + PayTabs يعمل!');
  console.log(`   http://localhost:${PORT}`);
  console.log('🧠 محرك الذكاء الاصطناعي: نشط');
  console.log('🚗 ====================================');
  console.log('');
  console.log('📌 افتح التطبيق على: http://localhost:3000/passenger.html');
  console.log('');
});

  console.log(`   http://localhost:${PORT}`);
  console.log('🚗 ====================================');
  console.log('');
  console.log('📌 افتح التطبيق على: http://localhost:3000/passenger.html');
  console.log('');
});
