/* رصيد — الاتجاه 1 «الدفتر»: سلوك الواجهة فقط (طي، تفاصيل الصفوف، فلاتر، تحديد، تحذير التكرار). */
(function () {
  var root = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var mqMobile = matchMedia('(max-width: 600px)');
  var mqTP = matchMedia('(min-width: 601px) and (max-width: 1024px)');
  var mqTL = matchMedia('(min-width: 1025px) and (max-width: 1279px)');
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  if (store('d1-index') === 'collapsed') root.classList.add('idx-collapsed');

  function say(msg) {
    var s = $('.main .status') || $('.status');
    if (!s) return;
    s.textContent = '';
    setTimeout(function () { s.textContent = msg; }, 30);
  }

  document.addEventListener('DOMContentLoaded', function () {
    /* طي الفهرس الجانبي (لوحي عمودي) */
    $$('[data-collapse]').forEach(function (b) {
      var lbl = $('.lbl', b);
      function sync() {
        var c = root.classList.contains('idx-collapsed');
        b.setAttribute('aria-expanded', String(!c));
        lbl.textContent = c ? 'الفهرس' : 'طيّ';
        b.setAttribute('aria-label', c ? 'إظهار الفهرس' : 'طيّ الفهرس');
      }
      sync();
      b.addEventListener('click', function () {
        root.classList.toggle('idx-collapsed');
        store('d1-index', root.classList.contains('idx-collapsed') ? 'collapsed' : 'open');
        sync();
      });
    });

    /* تفاصيل الصف (لوحي): الأعمدة الثانوية في سطر تحت الصف */
    $$('[data-expand]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var tr = b.closest('tr'), d = tr.nextElementSibling;
        var open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', String(open));
        if (d && d.classList.contains('row-detail')) d.hidden = !open;
      });
    });

    /* مزامنة مبدّلات الدور */
    document.addEventListener('rased:role', function (e) {
      $$('[data-role-select]').forEach(function (s) { s.value = e.detail; });
    });

    /* الفترة والتصدير: نموذج فقط */
    $$('[data-period]').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var a = f.elements.from.value, b = f.elements.to.value;
        say(a || b ? 'الفترة المختارة: ' + (a || 'البداية') + ' إلى ' + (b || 'النهاية') + '. (نموذج للعرض)' : 'تُعرض كل الحركات.');
      });
    });
    $$('[data-export]').forEach(function (b) {
      b.addEventListener('click', function () { say('يُجهَّز ملف ' + b.getAttribute('data-export') + ' (نموذج للعرض).'); });
    });

    var pg = document.body.getAttribute('data-page');
    if (pg === 'dash') dash();
    if (pg === 'inv') invoices();
    if (pg === 'add') addEntry();
    if (pg === 'review') review();
  });

  /* ===== لوحة الأرصدة: اختيار مورد من الفهرس ===== */
  function dash() {
    var picks = $$('[data-pick]');
    picks.forEach(function (b) {
      b.addEventListener('click', function () {
        picks.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        var f = b.dataset.f, neg = f.charAt(0) === '-';
        $$('[data-fo]').forEach(function (el) {
          var k = el.getAttribute('data-fo');
          if (k === 's') el.textContent = neg ? 'مستحق للمورد' : 'رصيد مدين';
          else el.textContent = b.dataset[k];
          if (k === 'f' || k === 'p' || k === 's') el.classList.toggle('neg', (k === 'p' ? b.dataset.p.charAt(0) === '-' : neg));
        });
        if (mqTP.matches && b.dataset.pick !== 't') {
          var row = document.getElementById('sup-' + b.dataset.pick);
          if (row) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
        }
      });
    });
    // تلوين أولي
    var first = $('[data-fo="f"]'); if (first && first.textContent.charAt(0) === '-') first.classList.add('neg');
  }

  /* ===== الفواتير: فلتر، تحديد جماعي، ضغط مطوّل، تحديد كـدخلت ===== */
  function invoices() {
    var rows = $$('tr[data-inv]');
    var filter = 'all';
    var body = document.body;
    function checked() { return rows.filter(function (r) { return $('.pick-in', r).checked; }); }
    function refresh() {
      var sel = checked();
      rows.forEach(function (r) { r.classList.toggle('is-sel', $('.pick-in', r).checked); });
      $$('[data-sel-count]').forEach(function (c) { c.textContent = sel.length ? 'محدد: ' + sel.length : 'لا فواتير محددة'; });
      $$('[data-mark]').forEach(function (b) { b.disabled = !sel.length; });
      var vis = rows.filter(function (r) { return !r.hidden; });
      var all = $('#pickAll');
      if (all) { all.checked = vis.length > 0 && vis.every(function (r) { return $('.pick-in', r).checked; }); all.indeterminate = !all.checked && sel.length > 0; }
    }
    function applyFilter() {
      rows.forEach(function (r) {
        var show = filter === 'all' || r.dataset.state === filter;
        r.hidden = !show;
        var d = r.nextElementSibling;
        if (d && d.classList.contains('row-detail')) { if (!show) d.hidden = true; else { var x = $('[data-expand]', r); d.hidden = !(x && x.getAttribute('aria-expanded') === 'true'); } }
        if (!show) $('.pick-in', r).checked = false;
      });
      refresh();
    }
    function report() {
      var list = $('[data-report]'); if (!list) return;
      list.innerHTML = '';
      rows.filter(function (r) { return r.dataset.state === 'out'; }).forEach(function (r) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="num">' + r.dataset.inv + '</span> <span class="num">' + r.dataset.amt + '</span>';
        list.appendChild(li);
      });
    }
    $$('[data-filter]').forEach(function (b) {
      b.addEventListener('click', function () {
        filter = b.dataset.filter;
        $$('[data-filter]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        applyFilter();
      });
    });
    rows.forEach(function (r) { $('.pick-in', r).addEventListener('change', refresh); });
    var all = $('#pickAll');
    if (all) all.addEventListener('change', function () {
      rows.forEach(function (r) { if (!r.hidden) $('.pick-in', r).checked = all.checked; });
      refresh();
    });
    $$('[data-mark]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (root.getAttribute('data-role') === 'entry') return;
        var sel = checked();
        sel.forEach(function (r) {
          r.dataset.state = 'in';
          var s = $('.stamp', r); s.dataset.state = 'in'; s.textContent = 'دخلت';
          $('.pick-in', r).checked = false;
        });
        say('حُدِّدت ' + sel.length + ' فاتورة كـ«دخلت».');
        report(); applyFilter();
        if (mqMobile.matches) exitSelecting();
      });
    });

    /* الجوال: ضغط مطوّل 500ms يدخل وضع التحديد، ثم النقر يحدد */
    function enterSelecting(r) {
      body.classList.add('selecting');
      if (r) { $('.pick-in', r).checked = true; }
      refresh();
    }
    function exitSelecting() {
      body.classList.remove('selecting');
      rows.forEach(function (r) { $('.pick-in', r).checked = false; });
      refresh();
    }
    var timer = null, sx = 0, sy = 0, longFired = false;
    rows.forEach(function (r) {
      r.addEventListener('pointerdown', function (e) {
        if (!mqMobile.matches || body.classList.contains('selecting')) return;
        longFired = false; sx = e.clientX; sy = e.clientY;
        clearTimeout(timer);
        timer = setTimeout(function () { longFired = true; enterSelecting(r); if (navigator.vibrate) navigator.vibrate(15); }, 500);
      });
      r.addEventListener('pointermove', function (e) { if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) clearTimeout(timer); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { r.addEventListener(ev, function () { clearTimeout(timer); }); });
      r.addEventListener('contextmenu', function (e) { if (mqMobile.matches) e.preventDefault(); });
      r.addEventListener('click', function (e) {
        if (longFired) { longFired = false; return; }
        if (!body.classList.contains('selecting') || !mqMobile.matches) return;
        if (e.target.closest('.pick, button, a')) return;
        var c = $('.pick-in', r); c.checked = !c.checked; refresh();
      });
    });
    var sm = $('[data-select-mode]'); if (sm) sm.addEventListener('click', function () { enterSelecting(null); });
    var cs = $('[data-cancel-sel]'); if (cs) cs.addEventListener('click', exitSelecting);
    report(); refresh();
  }

  /* ===== إضافة حركة: توليد الرقم المرجعي والتحذير الصارم ===== */
  function addEntry() {
    var form = $('#entry'), date = $('#fDate'), ref = $('#fRef'), out = $('#fRefNo'), amtHint = $('#amt-hint');
    var dup = $('#dup'), on = $('[data-dup-on]'), off = $('[data-dup-off]'), confirmBox = $('#confirmDup');
    var saves = $$('[data-save]'), body = document.body, dismissed = false, isDup = false;
    var KNOWN = 'MISC/2026/08/0395';
    function type() { var c = $('input[name="type"]:checked'); return c ? c.value : 'misc'; }
    function gen() {
      var t = type(), r = ref.value.trim(), d = date.value, no = '';
      if (t === 'inv') no = r ? 'P' + r : '';
      else if (r && /^\d{4}-\d{2}-\d{2}$/.test(d)) { var p = d.split('-'); no = 'MISC/' + p[0] + '/' + p[1] + '/' + r; }
      out.textContent = no || 'يُكمَل بعد إدخال المرجع والتاريخ';
      form.dataset.type = t;
      amtHint.textContent = t === 'inv' ? 'فاتورة: يُسجَّل المبلغ في عمود الدائن تلقائياً.' : 'قيد: يُسجَّل المبلغ في عمود المدين تلقائياً.';
      $('[data-mine-type]').textContent = t === 'inv' ? 'فاتورة' : 'قيد';
      $('[data-mine-date]').textContent = d;
      setDup(no === KNOWN);
    }
    function setDup(d) {
      var changed = d !== isDup; isDup = d;
      on.hidden = !d; off.hidden = d;
      dup.classList.toggle('ok', !d);
      out.classList.toggle('is-dup', d);
      if (!d) { confirmBox.checked = false; dismissed = false; }
      if (changed && d) dismissed = false;
      body.classList.toggle('takeover', d && mqMobile.matches && !dismissed);
      updateSave();
    }
    function updateSave() { saves.forEach(function (b) { b.disabled = isDup && !confirmBox.checked; }); }
    function save(again) {
      if (saves[0].disabled) { say('الحفظ متوقف: أكّد أنها حركة مختلفة أو عدّل المرجع.'); confirmBox.focus(); return; }
      say(again ? 'حُفظت الحركة (نموذج). حركة جديدة جاهزة.' : 'حُفظت الحركة (نموذج للعرض).');
      if (again) { ref.value = ''; $('#fAmt').value = ''; $('#fV').value = ''; $('#fDesc').value = ''; gen(); ref.focus(); }
    }
    [date, ref].forEach(function (el) { el.addEventListener('input', gen); el.addEventListener('change', gen); });
    $$('input[name="type"]').forEach(function (r) { r.addEventListener('change', gen); });
    confirmBox.addEventListener('change', updateSave);
    $('[data-back]').addEventListener('click', function () { dismissed = true; body.classList.remove('takeover'); ref.focus(); ref.select(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); save(false); });
    $('[data-save="new"]').addEventListener('click', function () { save(true); });
    $('[data-cancel]').addEventListener('click', function () { form.reset(); dismissed = false; gen(); say('أُلغيت التعديلات.'); });
    $$('[data-sup]').forEach(function (b) {
      b.addEventListener('click', function () {
        $('#fSup').value = b.dataset.sup;
        $$('[data-sup]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
    });
    $('#fSup').addEventListener('change', function () {
      var v = this.value; $$('[data-sup]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.sup === v)); });
    });
    document.addEventListener('keydown', function (e) {
      var k = e.key;
      if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'S' || e.code === 'KeyS')) { e.preventDefault(); save(false); }
      else if ((e.ctrlKey || e.metaKey) && k === 'Enter') { e.preventDefault(); save(true); }
      else if (e.altKey && (e.code === 'Digit1' || e.code === 'Digit2')) {
        e.preventDefault();
        var v = e.code === 'Digit1' ? 'inv' : 'misc';
        var r = $('input[name="type"][value="' + v + '"]'); r.checked = true; gen();
      } else if (k === 'Escape') {
        if (body.classList.contains('takeover')) { $('[data-back]').click(); }
        else $('[data-cancel]').click();
      }
    });
    mqMobile.addEventListener('change', function () { body.classList.toggle('takeover', isDup && mqMobile.matches && !dismissed); });
    gen();
  }

  /* ===== مركز المراجعة ===== */
  function review() {
    var main = $('#main');
    $$('[data-mcat]').forEach(function (b) {
      if (b.tagName !== 'BUTTON') return;
      b.addEventListener('click', function () {
        main.setAttribute('data-mcat', b.dataset.mcat);
        $$('button[data-mcat]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
    });
    $$('[data-tcat]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        main.setAttribute('data-tcat', a.dataset.tcat);
        $$('[data-tcat]').forEach(function (x) { if (x === a) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current'); });
        if (mqTL.matches) { e.preventDefault(); main.focus({ preventScroll: true }); }
      });
    });
    $$('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var cell = b.closest('td'), done = $('.act-done', cell);
        var ok = b.dataset.act === 'ok';
        $('.acts', cell).hidden = true;
        done.hidden = false;
        done.textContent = ok ? 'اعتُمد المرجّح' : 'تم التجاهل';
        var tr = b.closest('tr');
        if (ok) $$('.cur', tr).forEach(function (c) { c.style.opacity = '.75'; });
        say(ok ? 'اعتُمد التاريخ المرجّح (نموذج).' : 'تم تجاهل التنبيه (نموذج).');
      });
    });
  }
})();
