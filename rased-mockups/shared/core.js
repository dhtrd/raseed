/* رصيد — سكربت مشترك صغير للنماذج فقط: الوضع الفاتح/الداكن، الدور، رمز الريال.
   لا منطق أعمال هنا. */
(function () {
  var root = document.documentElement;
  var params = new URLSearchParams(location.search);
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  // الوضع: ?theme= ثم التخزين ثم تفضيل النظام
  var theme = params.get('theme') || store('rased-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');

  // الدور للعرض فقط: owner | admin | entry
  var role = params.get('role') || store('rased-role') || 'owner';
  if (['owner', 'admin', 'entry'].indexOf(role) < 0) role = 'owner';
  root.setAttribute('data-role', role);

  window.Rased = {
    setTheme: function (t) { root.setAttribute('data-theme', t); store('rased-theme', t); syncThemeButtons(); },
    toggleTheme: function () { this.setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); },
    setRole: function (r) { root.setAttribute('data-role', r); store('rased-role', r); document.dispatchEvent(new CustomEvent('rased:role', { detail: r })); }
  };

  function syncThemeButtons() {
    var dark = root.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(dark));
      b.setAttribute('aria-label', dark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    // رمز الريال السعودي الرسمي (U+20C1) كرمز SVG واحد يُستدعى بـ <use href="#sar">
    if (!document.getElementById('sar')) {
      var holder = document.createElement('div');
      holder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><symbol id="sar" viewBox="40 0 1145 1270"><path fill="currentColor" d="M750,1119 C730,1163,716,1211,711,1262 C711,1262,1136,1172,1136,1172 C1156,1127,1169,1079,1174,1028 C1174,1028,750,1119,750,1119Z M1136,901 C1136,901,1136,901,1136,901 C1156,857,1169,809,1174,758 C1174,758,843,828,843,828 C843,828,843,693,843,693 C843,693,1136,631,1136,631 C1156,587,1169,538,1174,488 C1174,488,843,558,843,558 C843,558,843,72,843,72 C793,100,748,138,711,183 C711,183,711,586,711,586 C711,586,579,614,579,614 C579,614,579,6,579,6 C528,34,483,72,447,117 C447,117,447,642,447,642 C447,642,151,705,151,705 C131,750,117,798,112,849 C112,849,447,777,447,777 C447,777,447,948,447,948 C447,948,88,1024,88,1024 C68,1068,55,1117,50,1167 C50,1167,425,1088,425,1088 C456,1081,482,1063,499,1038 C499,1038,568,936,568,936 C568,936,568,936,568,936 C575,926,579,913,579,899 C579,899,579,749,579,749 C579,749,711,721,711,721 C711,721,711,992,711,992 C711,992,1136,901,1136,901Z "/></symbol></svg>';
      document.body.insertBefore(holder.firstChild, document.body.firstChild);
    }
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.addEventListener('click', function () { window.Rased.toggleTheme(); });
    });
    document.querySelectorAll('[data-role-select]').forEach(function (s) {
      s.value = root.getAttribute('data-role');
      s.addEventListener('change', function () { window.Rased.setRole(s.value); });
    });
    syncThemeButtons();
  });
})();
