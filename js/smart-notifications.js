// ===================================================
// 🔔 نظام الإشعارات الذكية - Smart Notifications SDK
// يُدرج في passenger.html و driver.html
// ===================================================

(function() {
  'use strict';

  const SNAD_SMART = {
    userId: null,
    role: null,       // 'passenger' | 'driver'
    fcmToken: null,
    serverUrl: window.location.origin,
    workPattern: null, // لتتبع ساعات العمل

    // == تهيئة النظام ==
    init: async function(userId, role) {
      this.userId = userId;
      this.role = role;
      this._loadWorkPattern();

      // تسجيل Service Worker
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('/firebase-messaging-sw.js');
          console.log('[SmartNotif] Service Worker مسجّل ✅');
        } catch(e) {
          console.log('[SmartNotif] خطأ في تسجيل SW:', e);
        }
      }

      // طلب صلاحية الإشعارات
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        console.log('[SmartNotif] تم منح صلاحية الإشعارات ✅');
        this._registerWithServer('mock_fcm_token_' + userId + '_' + Date.now());
      } else {
        console.log('[SmartNotif] لم يتم منح صلاحية الإشعارات');
      }

      // بدء مراقبة السلوك
      this._startBehaviorTracking();
    },

    // == تسجيل المستخدم في الخادم ==
    _registerWithServer: function(token) {
      this.fcmToken = token;
      fetch(this.serverUrl + '/api/smart/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          role: this.role,
          fcmToken: token
        })
      }).catch(() => {});
    },

    // == الإبلاغ عن نشاط ==
    reportActivity: function(type, data = {}) {
      const endpoint = this.role === 'driver'
        ? '/api/smart/driver-activity'
        : '/api/smart/passenger-activity';

      const payload = this.role === 'driver'
        ? { driverId: this.userId, ...data }
        : { passengerId: this.userId, action: type, ...data };

      fetch(this.serverUrl + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});

      // تسجيل نمط العمل محلياً للسائق
      if (this.role === 'driver' && type === 'online') {
        this._recordWorkHour();
      }
    },

    // == إشعار محلي فوري ==
    showLocal: function(title, body, options = {}) {
      if (Notification.permission !== 'granted') return;
      const n = new Notification(title, {
        body,
        icon: '/assets/passenger_logo.png',
        badge: '/assets/passenger_logo.png',
        vibrate: [200, 100, 200],
        tag: options.tag || 'snad',
        requireInteraction: options.requireInteraction || false,
        ...options
      });
      n.onclick = function() {
        window.focus();
        n.close();
        if (options.url) window.location.href = options.url;
      };
      return n;
    },

    // == تتبع نمط ساعات العمل ==
    _recordWorkHour: function() {
      const hour = new Date().getHours();
      const day = new Date().getDay();
      const key = 'snad_work_pattern_' + this.userId;
      const pattern = JSON.parse(localStorage.getItem(key) || '{}');
      const dayKey = 'day_' + day;
      if (!pattern[dayKey]) pattern[dayKey] = {};
      pattern[dayKey]['h' + hour] = (pattern[dayKey]['h' + hour] || 0) + 1;
      localStorage.setItem(key, JSON.stringify(pattern));
      this.workPattern = pattern;
    },

    // == تحميل نمط العمل ==
    _loadWorkPattern: function() {
      const key = 'snad_work_pattern_' + this.userId;
      this.workPattern = JSON.parse(localStorage.getItem(key) || '{}');
    },

    // == مراقبة السلوك التلقائية ==
    _startBehaviorTracking: function() {
      const self = this;

      // تذكير السائق بوقت عمله المعتاد
      if (this.role === 'driver') {
        setInterval(function() {
          const now = new Date();
          const hour = now.getHours();
          const day = now.getDay();
          const pattern = self.workPattern;
          const dayKey = 'day_' + day;

          if (pattern[dayKey] && pattern[dayKey]['h' + hour] >= 2) {
            const key = 'snad_peak_notif_' + hour + '_' + day;
            const lastNotif = localStorage.getItem(key);
            const oneDay = 24 * 60 * 60 * 1000;

            if (!lastNotif || Date.now() - parseInt(lastNotif) > oneDay) {
              self.showLocal(
                '⏰ حان وقت عملك المعتاد!',
                'درجت على العمل الآن. سجّل دخولك وابدأ استقبال الطلبات 🚗',
                { requireInteraction: true, tag: 'work_reminder' }
              );
              localStorage.setItem(key, Date.now().toString());
            }
          }

          // إشعار الذروة تلقائياً
          if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
            const peakKey = 'snad_peak_alert_' + hour;
            const lastPeak = localStorage.getItem(peakKey);
            if (!lastPeak || Date.now() - parseInt(lastPeak) > 60 * 60 * 1000) {
              self.showLocal(
                '⚡ وقت الذروة الآن!',
                'الطلب مرتفع والأجرة أعلى. سجّل دخولك الآن 💰',
                { tag: 'peak_alert' }
              );
              localStorage.setItem(peakKey, Date.now().toString());
            }
          }
        }, 5 * 60 * 1000); // كل 5 دقائق
      }

      // مراقبة الراكب الذي فتح التطبيق بدون طلب
      if (this.role === 'passenger') {
        const openTime = Date.now();
        window.addEventListener('beforeunload', function() {
          const timeSpent = Date.now() - openTime;
          // إذا قضى أكثر من دقيقة بدون طلب
          if (timeSpent > 60000) {
            self.reportActivity('idle_exit');
            // سنرسل له عرض لاحقاً
          }
        });

        // استرداد بعد 30 دقيقة من إلغاء طلب
        const lastCancel = localStorage.getItem('snad_last_cancel_' + this.userId);
        if (lastCancel && Date.now() - parseInt(lastCancel) < 30 * 60 * 1000) {
          setTimeout(function() {
            self.showLocal(
              '🎁 عرض خاص لك!',
              'عد الآن واستخدم الكود SNAD15 للحصول على خصم 15% على رحلتك 🎉',
              { requireInteraction: true, tag: 'recovery_offer' }
            );
          }, 5000); // بعد 5 ثوانٍ من فتح التطبيق
        }
      }
    }
  };

  // تصدير للاستخدام العام
  window.SnadSmartNotif = SNAD_SMART;

})();
