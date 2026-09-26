const ProcessingActivity = require('../models/ProcessingActivity');

const BASELINE = [
  {
    key: 'platform-accounts-authentication',
    name: 'حسابات المنصة وتسجيل الدخول',
    purpose: 'إنشاء الحسابات، التحقق من الهوية، إدارة الأدوار والجلسات وحماية الوصول.',
    dataCategories: ['الاسم','البريد','الهاتف','الدور','الفرع','معرف الحساب','سجل الدخول'],
    dataSubjects: ['ملاك الأكاديميات','الموظفون','المدربون','الطلاب'],
    authorizedRoles: ['superadmin','owner','admin'],
    retentionPeriod: 'طوال مدة الحساب، ثم وفق طلب الحذف والالتزامات القانونية أو النزاعات القائمة.',
    deletionMechanism: 'تعطيل أو حذف الحساب وبياناته المرتبطة وفق طلب صالح وسياسة حذف البيانات.',
    recipients: ['مزود الاستضافة','مزود قاعدة البيانات'],
    transferDestinations: ['قد تتم المعالجة خارج سلطنة عمان بحسب موقع مزود البنية التحتية'],
    securityMeasures: ['bcrypt لكلمات المرور','HttpOnly/SameSite للجلسات','RBAC','عزل الأكاديميات','تحديد محاولات الدخول']
  },
  {
    key: 'student-academic-management',
    name: 'إدارة الطلاب والتسجيل والحضور',
    purpose: 'تمكين الأكاديمية من إدارة الطلاب والدورات والمجموعات والتسجيل والحضور.',
    dataCategories: ['بيانات التواصل','التسجيلات','المجموعات','الحضور','الفروع'],
    dataSubjects: ['الطلاب','أولياء الأمور عند إدخال بياناتهم'],
    authorizedRoles: ['owner','admin','branch_manager','reception','instructor'],
    retentionPeriod: 'وفق مدة علاقة الطالب بالأكاديمية والغرض التعليمي، ثم حسب تعليمات الأكاديمية والقانون.',
    deletionMechanism: 'حذف أو إخفاء البيانات بعد التحقق من الطلب ومراعاة السجلات التي يجب الاحتفاظ بها قانونًا.',
    recipients: ['الأكاديمية المعنية','مزود الاستضافة','مزود قاعدة البيانات'],
    transferDestinations: ['قد تتم المعالجة خارج سلطنة عمان لدى مزودي البنية التحتية'],
    securityMeasures: ['Tenant isolation','RBAC','Branch scoping','Audit log']
  },
  {
    key: 'assessments-grades',
    name: 'الاختبارات والواجبات والدرجات',
    purpose: 'إدارة التقييمات التعليمية وتسجيل المحاولات والدرجات والنتائج.',
    dataCategories: ['إجابات الطلاب','الدرجات','النتائج','المحاولات','التغذية الراجعة'],
    dataSubjects: ['الطلاب'],
    authorizedRoles: ['owner','admin','instructor','content_manager حسب الصلاحيات'],
    retentionPeriod: 'وفق الغرض التعليمي وسياسة الأكاديمية والالتزامات القانونية.',
    deletionMechanism: 'الحذف أو التقييد عند انتهاء الغرض أو عند طلب صالح حيث يسمح القانون.',
    recipients: ['الأكاديمية المعنية','مزود الاستضافة','مزود قاعدة البيانات'],
    transferDestinations: ['قد تتم المعالجة خارج سلطنة عمان لدى مزودي البنية التحتية'],
    securityMeasures: ['Scope by course/group','RBAC','Audit logging','Tenant isolation']
  },
  {
    key: 'payments-records',
    name: 'سجلات الدفعات',
    purpose: 'تسجيل تحصيلات الأكاديمية وإعداد التقارير المالية التشغيلية.',
    dataCategories: ['المبلغ','العملة','طريقة الدفع','المرجع','تاريخ الدفع','الطالب والدورة'],
    dataSubjects: ['الطلاب','عملاء الأكاديمية'],
    authorizedRoles: ['owner','admin','accountant'],
    retentionPeriod: 'وفق المتطلبات المحاسبية والقانونية المطبقة وسياسة الأكاديمية.',
    deletionMechanism: 'الاحتفاظ أو الحذف وفق الالتزامات المحاسبية والقانونية؛ لا تخزن بيانات البطاقة الكاملة افتراضيًا.',
    recipients: ['الأكاديمية المعنية','مزود الاستضافة','مزود قاعدة البيانات'],
    transferDestinations: ['قد تتم المعالجة خارج سلطنة عمان لدى مزودي البنية التحتية'],
    securityMeasures: ['Finance RBAC','Audit log','Tenant isolation']
  },
  {
    key: 'support-privacy-rights',
    name: 'الدعم وطلبات حقوق البيانات',
    purpose: 'معالجة تذاكر الدعم والشكاوى وطلبات الوصول والتصحيح والحذف والنقل والاعتراض.',
    dataCategories: ['الاسم','البريد','الهاتف','كود الأكاديمية','محتوى الطلب','حالة المعالجة'],
    dataSubjects: ['مستخدمو المنصة','أصحاب البيانات'],
    authorizedRoles: ['superadmin','support حسب نطاق الأكاديمية'],
    retentionPeriod: 'للمدة اللازمة لمعالجة الطلب وإثبات الامتثال أو التعامل مع نزاع قائم.',
    deletionMechanism: 'محو البيانات عند انتهاء الحاجة مع الاحتفاظ بالحد الأدنى اللازم لإثبات تنفيذ الطلب إذا لزم.',
    recipients: ['فريق الدعم المخول','الأكاديمية المعنية عند الحاجة'],
    transferDestinations: [],
    securityMeasures: ['Rate limiting','Same-origin requests','Identity verification workflow','Audit log']
  },
  {
    key: 'zoom-integration',
    name: 'تكامل Zoom',
    purpose: 'ربط حساب Zoom الخاص بالأكاديمية وإنشاء وإدارة المحاضرات المباشرة.',
    dataCategories: ['معرف Zoom','البريد','اسم العرض','حالة الربط','توكنات OAuth مشفرة','بيانات الجلسات'],
    dataSubjects: ['ملاك الأكاديميات','المدربون','الطلاب المشاركون في الجلسات'],
    authorizedRoles: ['owner','admin','instructor حسب النطاق'],
    retentionPeriod: 'طوال مدة تفعيل التكامل أو الحاجة التشغيلية، ثم حذف بيانات الربط عند الفصل.',
    deletionMechanism: 'إبطال التوكنات ومسح بيانات الربط عند Disconnect أو Deauthorization.',
    recipients: ['Zoom'],
    transferDestinations: ['بنية Zoom ومناطق المعالجة التي يحددها المزود'],
    securityMeasures: ['OAuth state validation','Encrypted tokens','Tenant scoping','Webhook validation']
  },
  {
    key: 'email-delivery',
    name: 'إرسال البريد التشغيلي',
    purpose: 'إرسال دعوات وتنبيهات ورسائل تشغيلية مرتبطة بالخدمة.',
    dataCategories: ['البريد الإلكتروني','محتوى الرسالة التشغيلية'],
    dataSubjects: ['مستخدمو المنصة'],
    authorizedRoles: ['النظام','الأدوار المصرح لها بالإرسال'],
    retentionPeriod: 'وفق الحاجة التشغيلية وسياسات مزود البريد.',
    deletionMechanism: 'عدم الاحتفاظ بمحتوى إضافي خارج ما يلزم للتشغيل، ومعالجة طلبات إيقاف المواد غير الضرورية.',
    recipients: ['Twilio SendGrid عند تفعيله'],
    transferDestinations: ['مناطق معالجة مزود البريد'],
    securityMeasures: ['API key in secrets','Role controls','No secret exposure in UI']
  },
  {
    key: 'security-audit-monitoring',
    name: 'الأمان وسجلات التدقيق والمراقبة',
    purpose: 'حماية المنصة، اكتشاف الحوادث، تتبع الإجراءات الحساسة والتحقيق في الأخطاء.',
    dataCategories: ['IP','User-Agent','Request ID','المستخدم والدور','قبل/بعد التغيير','أخطاء السيرفر'],
    dataSubjects: ['مستخدمو المنصة'],
    authorizedRoles: ['superadmin','النظام'],
    retentionPeriod: 'وفق الحاجة الأمنية والقانونية، مع مراجعة دورية لضرورة الاحتفاظ.',
    deletionMechanism: 'حذف أو أرشفة السجلات عند انتهاء مدة الاحتفاظ المحددة ما لم يوجد حادث أو نزاع قائم.',
    recipients: ['فريق المنصة المخول'],
    transferDestinations: ['مزود الاستضافة وقاعدة البيانات بحسب موقع الخدمة'],
    securityMeasures: ['Audit log','Monitoring alerts','SAST/DAST','RBAC tests','Tenant isolation tests']
  },
  {
    key: 'encrypted-backups',
    name: 'النسخ الاحتياطية المشفرة',
    purpose: 'استعادة الخدمة والبيانات بعد حادث تقني أو فقد بيانات.',
    dataCategories: ['نسخة من بيانات قاعدة البيانات التشغيلية'],
    dataSubjects: ['جميع الفئات الموجودة في قاعدة التشغيل'],
    authorizedRoles: ['superadmin','النظام'],
    retentionPeriod: 'وفق BACKUP_RETENTION_COUNT ودورة النسخ المحددة تشغيليًا.',
    deletionMechanism: 'التدوير التلقائي للنسخ القديمة وفق إعداد الاحتفاظ، مع حذف النسخ المنتهية.',
    recipients: ['Railway Volume','مزود S3-compatible عند تفعيل النسخة الخارجية'],
    transferDestinations: ['بحسب موقع مزود التخزين'],
    securityMeasures: ['AES-256-GCM','SHA-256 validation','Safety backup before restore','Restricted restore workflow']
  }
];

async function ensureBaseline() {
  for (const item of BASELINE) {
    await ProcessingActivity.updateOne(
      { key: item.key },
      {
        $setOnInsert: {
          ...item,
          systemManaged: true,
          active: true,
          lastReviewedAt: new Date()
        }
      },
      { upsert: true }
    );
  }
}

module.exports = { ensureBaseline, BASELINE };
