# AcademyFlow Starter v0.1

نسخة تأسيسية لنظام SaaS متعدد الأكاديميات، بنفس فلسفة DarbFlow.

## الموجود الآن
- Multi-tenant أساسه `academyId`
- Super Admin API + واجهة أولية
- إنشاء أكاديمية وكود تلقائي AF-0001
- إنشاء Owner لكل أكاديمية
- Trial لمدة 15 يوم + Grace لمدة 5 أيام
- تسجيل دخول بكود الأكاديمية
- أدوار أساسية
- LiveSession model
- تكامل Zoom Server-to-Server OAuth لإنشاء اجتماع Zoom
- زر الطالب/المستخدم يفتح Zoom بدل بث الفيديو داخل الموقع
- Health endpoint
- حماية JWT + Helmet + Rate Limiting

## التشغيل
1. انسخ `.env.example` إلى `.env`.
2. عدّل `MONGODB_URI` و `JWT_SECRET`.
3. شغّل:
   npm install
   npm run dev

## مهم: السوبر أدمن
النسخة الحالية تحتاج إنشاء مستخدم `superadmin` في MongoDB يدويًا أو عبر seed script في المرحلة القادمة.

## Zoom
ضع:
- ZOOM_ACCOUNT_ID
- ZOOM_CLIENT_ID
- ZOOM_CLIENT_SECRET
- ZOOM_USER_ID

النظام يستخدم REST API لإنشاء meeting ويحفظ `join_url` و`start_url` في قاعدة البيانات. الفيديو نفسه لا يمر عبر السيرفر، لذلك يبقى النظام أخف.

## المرحلة التالية المقترحة
- Seed script للسوبر أدمن والباقات
- صفحة إدارة الأكاديميات كاملة
- التجديد والتجميد التلقائي
- الفروع
- الموظفين والصلاحيات
- الطلاب والمدربين
- الدورات والأقسام والدروس
