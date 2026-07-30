/* ================================================================
   SNAD PRO - الخادم الشامل المتكامل
   يدعم: PayTabs + إعدادات ديناميكية + تسعير + سائقين + رحلات
   ================================================================ */
const http   = require('http');
const https  = require('https');
const url    = require('url');
const fs     = require('fs');
const path   = require('path');

const PORT       = process.env.PORT || 80;
const PUBLIC_DIR = __dirname;
const DB_FILE    = path.join(__dirname, 'snad_live_store.json');

// ===== هيكل قاعدة البيانات الافتراضي =====
const DEFAULTS = {
  metrics: { tripsToday:0, revenueToday:0, activeFleetPct:0, onlineCount:0, registeredPassengers:0 },
  drivers: [], registeredDrivers: [], passengers: [], trips: [],
  pricingRules: {
    eco:     { name:'سند X',   base:22, km:2.5, min:12, icon:'car',    commission:10 },
    comfort: { name:'Comfort', base:38, km:2.5, min:12, icon:'car',    commission:12 },
    xl:      { name:'XL',      base:45, km:3.0, min:15, icon:'car',    commission:12 },
    premium: { name:'Black',   base:75, km:4.0, min:20, icon:'car',    commission:15 }
  },
  settings: {
    appName: 'سند',
    minDriverBalance: 20,
    surgeMultiplier: 1.0,
    surgeEnabled: false,
    autoSurge: true,
    maintenanceMode: false,
    acceptNewDrivers: true,
    threeDSecure: true,
    googleMapsKey: 'AIzaSyDHhkYwsYUMw_O7ZSQ7mJU9NUfxobE59uc',
    regions: { riyadh:true, jeddah:true, dammam:false, makkah:false },
    paytabs: {
      enabled: true,
      profileId: '118240',
      serverKey: 'SRJNKJHRB6-JKZW2KGMRH-BR6DNM2DLM',
      baseUrl: 'https://secure.paytabs.sa',
      callbackUrl: 'http://34.165.9.100/api/callback',
      returnUrl: 'http://34.165.9.100/payment-success'
    }
  }
};

// ===== تحميل قاعدة البيانات =====
let liveStore = JSON.parse(JSON.stringify(DEFAULTS));
if (fs.existsSync(DB_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    liveStore = Object.assign({}, DEFAULTS, saved);
    if (!liveStore.settings)                   liveStore.settings          = DEFAULTS.settings;
    if (!liveStore.settings.paytabs)           liveStore.settings.paytabs  = DEFAULTS.settings.paytabs;
    if (!liveStore.settings.googleMapsKey)     liveStore.settings.googleMapsKey = DEFAULTS.settings.googleMapsKey;
    if (!liveStore.pricingRules || !liveStore.pricingRules.eco) liveStore.pricingRules = DEFAULTS.pricingRules;
  } catch(e) { console.error('[DB] خطأ في التحميل:', e.message); }
}

function saveStore() {
  fs.writeFileSync(DB_FILE, JSON.stringify(liveStore, null, 2), 'utf8');
}

function jsonRes(res, data, status) {
  const headers = {
    'Content-Type':  'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };
  res.writeHead(status || 200, headers);
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise(function(resolve) {
    var b = '';
    req.on('data', function(c) { b += c; });
    req.on('end', function() {
      try { resolve(JSON.parse(b || '{}')); } catch(e) { resolve({}); }
    });
  });
}

// ===== دفع PayTabs =====
function createPayment(d) {
  var cfg = liveStore.settings.paytabs;
  var payload = {
    profile_id:       parseInt(cfg.profileId),
    tran_type:        'sale',
    tran_class:       'ecom',
    cart_id:          'SNAD-' + Date.now(),
    cart_currency:    'SAR',
    cart_amount:      d.amount,
    cart_description: d.description || 'رحلة سند',
    callback:         cfg.callbackUrl,
    return:           cfg.returnUrl,
    customer_details: {
      name:    d.name    || 'راكب سند',
      email:   d.email   || 'passenger@snad.sa',
      phone:   d.phone   || '+966500000000',
      street1: 'الرياض',
      city:    'Riyadh',
      state:   'Riyadh',
      country: 'SA',
      zip:     '12234'
    },
    paypage_lang: 'ar',
    hide_shipping: true
  };
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify(payload);
    var u    = new URL(cfg.baseUrl + '/payment/request');
    var opts = {
      hostname: u.hostname,
      path:     u.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':    'application/json',
        'Authorization':   cfg.serverKey,
        'Content-Length':  Buffer.byteLength(body)
      }
    };
    var r = https.request(opts, function(res2) {
      var data2 = '';
      res2.on('data', function(c) { data2 += c; });
      res2.on('end',  function()  {
        try { resolve(JSON.parse(data2)); } catch(e) { reject(new Error('Invalid PayTabs response')); }
      });
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

// ===== الخادم الرئيسي =====
var server = http.createServer(function(req, res) {
  var p = decodeURIComponent(url.parse(req.url, true).pathname);

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    });
    res.end();
    return;
  }

  // ================== GET ==================
  if (req.method === 'GET') {

    // إعدادات التطبيق (يقرأها كل من تطبيق الراكب والسائق)
    if (p === '/api/v1/config' || p === '/api/config') {
      jsonRes(res, {
        success: true,
        config: {
          googleMapsKey:    liveStore.settings.googleMapsKey,
          appName:          liveStore.settings.appName,
          minDriverBalance: liveStore.settings.minDriverBalance,
          surgeMultiplier:  liveStore.settings.surgeMultiplier,
          surgeEnabled:     liveStore.settings.surgeEnabled,
          maintenanceMode:  liveStore.settings.maintenanceMode,
          regions:          liveStore.settings.regions,
          pricing:          liveStore.pricingRules,
          paytabsEnabled:   liveStore.settings.paytabs.enabled
        }
      });
      return;
    }

    if (p === '/api/v1/dashboard/metrics') {
      liveStore.metrics.onlineCount          = liveStore.drivers.length;
      liveStore.metrics.registeredPassengers = liveStore.passengers.length;
      jsonRes(res, { success:true, data:liveStore.metrics });
      return;
    }

    if (p === '/api/v1/fleet/live') {
      jsonRes(res, {
        success:          true,
        onlineDriversCount: liveStore.drivers.length,
        onlineDrivers:    liveStore.drivers,
        registeredDrivers:liveStore.registeredDrivers,
        passengers:       liveStore.passengers,
        activeTrips:      liveStore.trips.filter(function(t){ return t.status==='Ongoing'; }),
        metrics:          liveStore.metrics
      });
      return;
    }

    if (p === '/api/v1/fleet/online-drivers' || p === '/api/drivers') {
      jsonRes(res, { success:true, drivers:liveStore.drivers, registered:liveStore.registeredDrivers, data:liveStore.drivers });
      return;
    }

    if (p === '/api/v1/pricing') {
      jsonRes(res, { success:true, data:liveStore.pricingRules });
      return;
    }

    if (p === '/api/v1/admin/settings') {
      jsonRes(res, { success:true, data:liveStore.settings });
      return;
    }

    if (p === '/api/v1/trips') {
      jsonRes(res, { success:true, data:liveStore.trips });
      return;
    }

    if (p === '/api/v1/passengers') {
      jsonRes(res, { success:true, data:liveStore.passengers });
      return;
    }
  }

  // ================== POST ==================
  if (req.method === 'POST') {
    readBody(req).then(function(data) {

      // ----- دفع PayTabs -----
      if (p === '/api/pay' || p === '/api/pay-direct') {
        if (liveStore.settings.maintenanceMode) { jsonRes(res, {error:'التطبيق في وضع الصيانة'}, 503); return; }
        if (!liveStore.settings.paytabs.enabled){ jsonRes(res, {error:'الدفع غير مفعّل'}, 503); return; }
        createPayment(data)
          .then(function(result) {
            if (result.redirect_url || result.tran_ref) {
              jsonRes(res, { success:true, redirect_url:result.redirect_url, tran_ref:result.tran_ref, data:result });
            } else {
              jsonRes(res, { success:false, error:result.message||'فشل الدفع', raw:result }, 400);
            }
          })
          .catch(function(e) { jsonRes(res, { error:'PayTabs: ' + e.message }, 500); });
        return;
      }

      // ----- PayTabs Callback -----
      if (p === '/api/callback') {
        var status = ((data.payment_result)||{}).response_status;
        if (status === 'A') {
          liveStore.metrics.revenueToday += parseFloat(data.cart_amount || 0);
          saveStore();
          jsonRes(res, { success:true, message:'تم استقبال الدفع بنجاح' });
        } else {
          jsonRes(res, { success:false, message:'فشل الدفع', status:status });
        }
        return;
      }

      // ----- تسجيل سائق -----
      if (p === '/api/v1/driver/status' || p === '/api/v1/driver/register') {
        var nm  = data.name     || 'كابتن';
        var ph  = data.phone    || '+9665' + Math.floor(10000000 + Math.random()*90000000);
        var v   = data.vehicle  || 'تويوتا كامري 2024';
        var loc = data.location || 'الرياض';
        var ex  = liveStore.drivers.find(function(d){ return d.phone===ph; });
        if (!ex) {
          liveStore.drivers.unshift({ id:'SNAD-'+Math.floor(1000+Math.random()*9000), name:nm, phone:ph, vehicle:v, location:loc, status:'Online' });
        } else {
          ex.location = loc;
          ex.status   = data.status || 'Online';
        }
        var er = liveStore.registeredDrivers.find(function(r){ return r.phone===ph; });
        if (!er) {
          liveStore.registeredDrivers.unshift({ id:Date.now(), name:nm, phone:ph, vehicle:v, docsStatus:'مكتملة', status:'مفعل', approved:true, balance:data.balance||20 });
        }
        saveStore();
        jsonRes(res, { success:true, message:'تم ربط الكابتن', data:data });
        return;
      }

      // ----- تسجيل راكب -----
      if (p === '/api/v1/passenger/register') {
        var pass = { id:'PASS-'+Math.floor(1000+Math.random()*9000), name:data.name||'راكب', phone:data.phone||'+9665'+Math.floor(10000000+Math.random()*90000000), joinedAt:new Date().toLocaleTimeString('ar-SA') };
        liveStore.passengers.unshift(pass);
        liveStore.metrics.registeredPassengers += 1;
        saveStore();
        jsonRes(res, { success:true, message:'تم تسجيل الراكب', data:pass });
        return;
      }

      // ----- إنشاء رحلة -----
      if (p === '/api/v1/trip/create') {
        var trip = { tripId:'TRIP-'+Math.floor(1000+Math.random()*9000), customer:data.customer||'راكب سند', phone:data.phone||'+966500000000', driver:data.driver||'بانتظار', pickup:data.pickup||'الرياض', dropoff:data.dropoff||'الرياض', fareSAR:data.fareSAR||45, status:'Ongoing', createdAt:new Date().toLocaleTimeString('ar-SA') };
        liveStore.trips.unshift(trip);
        liveStore.metrics.tripsToday += 1;
        liveStore.metrics.revenueToday += trip.fareSAR;
        saveStore();
        jsonRes(res, { success:true, message:'تم إنشاء الرحلة', data:trip });
        return;
      }

      // ----- إنهاء رحلة -----
      if (p === '/api/v1/trip/finish') {
        var tr = liveStore.trips.find(function(t){ return t.tripId===data.tripId; });
        if (tr) { tr.status='Completed'; tr.finishedAt=new Date().toLocaleTimeString('ar-SA'); saveStore(); }
        jsonRes(res, { success:true, message:'تم إنهاء الرحلة' });
        return;
      }

      // ----- اعتماد سائق -----
      if (p === '/api/v1/driver/approve') {
        var drv = liveStore.registeredDrivers.find(function(d){ return d.id===data.id; });
        if (drv) { drv.approved=true; drv.status='مفعل ومستندات معتمدة'; saveStore(); }
        jsonRes(res, { success:true, message:'تم تفعيل الكابتن' });
        return;
      }

      // ----- حذف سائق -----
      if (p === '/api/v1/admin/driver/remove') {
        liveStore.drivers           = liveStore.drivers.filter(function(d){ return d.id!==data.id && d.phone!==data.phone; });
        liveStore.registeredDrivers = liveStore.registeredDrivers.filter(function(d){ return d.id!==data.id && d.phone!==data.phone; });
        saveStore();
        jsonRes(res, { success:true, message:'تم حذف السائق' });
        return;
      }

      // ----- تحديث التسعير -----
      if (p === '/api/v1/admin/pricing') {
        if (data.pricingRules) { liveStore.pricingRules = data.pricingRules; saveStore(); }
        jsonRes(res, { success:true, message:'تم حفظ التسعيرة', data:liveStore.pricingRules });
        return;
      }

      // ----- تحديث الإعدادات الكاملة (بوابة الدفع + Maps + كل شيء) -----
      if (p === '/api/v1/admin/settings') {
        if (data.settings) {
          var prev = liveStore.settings;
          liveStore.settings = Object.assign({}, prev, data.settings);
          if (data.settings.paytabs) {
            liveStore.settings.paytabs = Object.assign({}, prev.paytabs, data.settings.paytabs);
          }
          if (data.settings.regions) {
            liveStore.settings.regions = Object.assign({}, prev.regions, data.settings.regions);
          }
          saveStore();
        }
        jsonRes(res, { success:true, message:'تم حفظ الإعدادات بنجاح', data:liveStore.settings });
        return;
      }

      // ----- إعادة تعيين -----
      if (p === '/api/v1/admin/reset') {
        if (data.target === 'daily') {
          liveStore.metrics.tripsToday = 0; liveStore.metrics.revenueToday = 0; saveStore();
          jsonRes(res, { success:true, message:'تم إعادة تعيين إحصائيات اليوم' });
        } else if (data.target === 'trips') {
          liveStore.trips = []; saveStore();
          jsonRes(res, { success:true, message:'تم مسح الرحلات' });
        } else {
          jsonRes(res, { error:'target غير معروف' }, 400);
        }
        return;
      }

      jsonRes(res, { error:'Endpoint not found', path:p }, 404);
    });
    return;
  }

  // ================== ملفات ساكنة ==================
  var fp = path.join(PUBLIC_DIR, p === '/' ? 'index.html' : p);
  fs.readFile(fp, function(err, fileData) {
    if (err) {
      res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    var ext = path.extname(fp).toLowerCase();
    var ct  = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.woff2':'font/woff2' };
    res.writeHead(200, { 'Content-Type':(ct[ext]||'text/html')+'; charset=utf-8', 'Cache-Control':'no-cache' });
    res.end(fileData);
  });
});

server.listen(PORT, '0.0.0.0', function() {
  console.log('[سند PRO] يعمل على http://0.0.0.0:' + PORT);
});

process.on('uncaughtException', function(e) { console.error('[خطأ]', e.message); });
