// إعدادات Firebase الخاصة بتطبيق سند
const firebaseConfig = {
    // ⚠️ قم بتغيير هذه الإعدادات ببيانات مشروع Firebase الحقيقي الخاص بك
    apiKey: "AIzaSy_YOUR_API_KEY",
    authDomain: "snad-taxi-app.firebaseapp.com",
    databaseURL: "https://snad-taxi-app-default-rtdb.firebaseio.com",
    projectId: "snad-taxi-app",
    storageBucket: "snad-taxi-app.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};

// تهيئة Firebase إذا لم يكن مهيئاً
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// إنشاء مرجع لقاعدة البيانات اللحظية
const db = firebase.database();
window.snadDB = db; // جعله متاحاً بشكل عام
