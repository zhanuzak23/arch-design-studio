/* ============================================================
   ARCH design · studio — interactions, calculator & CRM
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.ARCH_CONFIG || {};
  var CALC = CFG.calc || {};
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOBILE = window.matchMedia('(max-width:620px)');
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------------------------------------------------
     Утилиты
     --------------------------------------------------------- */
  var NBSP = ' ';

  function money(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  var toastEl = $('#toast'), toastT;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 4200);
  }

  function maskPhone(input) {
    if (!input) return;
    input.addEventListener('input', function () {
      var d = input.value.replace(/\D/g, '');
      if (d.charAt(0) === '8') d = '7' + d.slice(1);
      if (d.charAt(0) !== '7') d = '7' + d;
      d = d.slice(0, 11);
      var out = '+7';
      if (d.length > 1) out += ' (' + d.slice(1, 4);
      if (d.length >= 4) out += ')';
      if (d.length > 4) out += ' ' + d.slice(4, 7);
      if (d.length > 7) out += ' ' + d.slice(7, 9);
      if (d.length > 9) out += ' ' + d.slice(9, 11);
      input.value = out;
    });
  }

  /* ---------------------------------------------------------
     Аналитика: одна точка входа для всех событий.
     Идентификаторы счётчиков — в config.js (analytics).
     --------------------------------------------------------- */
  var AN = CFG.analytics || {};

  function track(event, params) {
    var data = params || {};
    try {
      if (AN.yandexMetrika && window.ym) window.ym(AN.yandexMetrika, 'reachGoal', event, data);
      if (window.gtag) window.gtag('event', event, data);
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: event }, data));
    } catch (e) { /* аналитика не должна ломать сайт */ }
    if (AN.debug) console.info('[track]', event, data);
  }

  /* клики по всему, что помечено data-track */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-track]');
    if (el) track(el.getAttribute('data-track'));
    var tel = e.target.closest && e.target.closest('a[href^="tel:"]');
    if (tel) track('click_phone', { phone: tel.getAttribute('href').slice(4) });
    var wa = e.target.closest && e.target.closest('a[href*="wa.me"]');
    if (wa) track('click_whatsapp');
  });

  /* ---------------------------------------------------------
     CRM: отправка заявки
     1) свой эндпоинт  2) Telegram Bot API  3) WhatsApp (fallback)
     --------------------------------------------------------- */
  var CRM = (CFG.crm || {});

  function tgText(payload) {
    var lines = ['<b>Новая заявка с сайта</b>', ''];
    lines.push('<b>Источник:</b> ' + payload.source);
    if (payload.name)  lines.push('<b>Имя:</b> ' + payload.name);
    if (payload.phone) lines.push('<b>Телефон:</b> ' + payload.phone);
    if (payload.type)  lines.push('<b>Объект:</b> ' + payload.type);
    if (payload.msg)   lines.push('<b>Комментарий:</b> ' + payload.msg);
    if (payload.calc) {
      lines.push('', '<b>Расчёт калькулятора</b>');
      payload.calc.forEach(function (r) { lines.push('• ' + r[0] + ': ' + r[1]); });
    }
    lines.push('', '<i>' + new Date().toLocaleString('ru-RU') + '</i>');
    return lines.join('\n');
  }

  function plainText(payload) {
    return tgText(payload).replace(/<\/?[a-z]+>/g, '');
  }

  function sendLead(payload) {
    payload.page = location.href;

    if (CRM.endpoint) {
      return fetch(CRM.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return { via: 'endpoint' };
      });
    }

    var tg = CRM.telegram || {};
    if (tg.botToken && tg.chatId) {
      return fetch('https://api.telegram.org/bot' + tg.botToken + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tg.chatId, text: tgText(payload), parse_mode: 'HTML' })
      }).then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) throw new Error(j.description || 'Telegram error');
          return { via: 'telegram' };
        });
    }

    if (CRM.whatsapp) {
      var url = 'https://wa.me/' + CRM.whatsapp + '?text=' + encodeURIComponent(plainText(payload));
      window.open(url, '_blank', 'noopener');
      return Promise.resolve({ via: 'whatsapp' });
    }

    return Promise.reject(new Error('CRM не настроена'));
  }

  /* ---------------------------------------------------------
     Шапка: тень, прогресс чтения, активный пункт
     --------------------------------------------------------- */
  var hdr = $('#hdr'), bar = $('#progressBar');

  function onScroll() {
    var y = window.scrollY;
    hdr.classList.toggle('is-stuck', y > 6);
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* мобильное меню — шторка справа */
  var burger = $('#burger'), nav = $('#nav');
  var veil = document.createElement('div');
  veil.className = 'nav-veil';
  document.body.appendChild(veil);

  function setNav(open) {
    nav.classList.toggle('is-open', open);
    veil.classList.toggle('is-on', open);
    document.body.classList.toggle('is-nav-open', open);
    burger.setAttribute('aria-expanded', String(open));
  }
  function closeNav() { setNav(false); }

  burger.addEventListener('click', function () { setNav(!nav.classList.contains('is-open')); });
  veil.addEventListener('click', closeNav);
  nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') closeNav(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNav(); });
  var MOBILE_NAV = window.matchMedia('(max-width:900px)');
  if (MOBILE_NAV.addEventListener) {
    MOBILE_NAV.addEventListener('change', function (e) { if (!e.matches) closeNav(); });
  }

  /* активный пункт навигации */
  var navLinks = $$('a', nav);
  var navTargets = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);
  if ('IntersectionObserver' in window && navTargets.length) {
    var so = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    navTargets.forEach(function (s) { so.observe(s); });
  }

  /* ---------------------------------------------------------
     ДВИЖЕНИЕ
     Заголовки выезжают из-под кромки, изображения раскрываются
     шторкой, элементы в сетках появляются с шагом.
     --------------------------------------------------------- */

  /* заголовки оборачиваем автоматически — разметку не засоряем */
  if (!reduced) {
    /* только блочные заголовки: у флекс-контейнеров обёртка съела бы gap */
    $$('.hero__h1, .h2, .hero__badge b').forEach(function (el) {
      if (el.querySelector('.rv-mask')) return;
      var inner = document.createElement('span');
      inner.innerHTML = el.innerHTML;
      var mask = document.createElement('span');
      mask.className = 'rv-mask';
      mask.appendChild(inner);
      el.innerHTML = '';
      el.appendChild(mask);
    });

    /* фотографии раскрываем шторкой.
       Кейсы сюда не входят: их визуал живёт в ::after, а шторка заняла бы
       тот же псевдоэлемент — им отдана отдельная анимация масштабом. */
    $$('.pers__ph').forEach(function (el) {
      el.classList.add('rv-img');
    });
  }

  /* шаг появления внутри одной сетки */
  function stagger(container, step) {
    $$('.reveal', container).forEach(function (el, i) {
      el.style.setProperty('--d', Math.min(i * (step || 80), 420) + 'ms');
    });
  }
  ['.bento', '.srv', '.srv__extra', '.cases', '.team', '.price', '.proc', '.hero__facts']
    .forEach(function (sel) { $$(sel).forEach(function (c) { stagger(c); }); });

  var revealables = $$('.reveal, .rv-img, .rv-line');
  if (reduced || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var ro = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        ro.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    revealables.forEach(function (el) { ro.observe(el); });

    /* первый экран показываем сразу, без ожидания скролла */
    setTimeout(function () {
      $$('.hero .reveal, .hero .rv-img').forEach(function (el, i) {
        el.style.setProperty('--d', (i * 90) + 'ms');
        el.classList.add('is-in');
      });
    }, 40);

    /* Страховка. Наблюдатель молчит в фоновых вкладках и в редких браузерах —
       через 2.5 с показываем всё, что уже попало в кадр, чтобы контент
       ни при каких условиях не остался невидимым. */
    setTimeout(function () {
      revealables.forEach(function (el) {
        if (el.classList.contains('is-in')) return;
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 1.2) el.classList.add('is-in');
      });
    }, 2500);

    /* когда вкладку наконец открыли — досматриваем видимое */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      revealables.forEach(function (el) {
        if (el.classList.contains('is-in')) return;
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('is-in');
      });
    });
  }


  function runCounter(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    if (reduced) { el.textContent = target + suffix; return; }
    var t0 = performance.now(), dur = 1500;
    (function step(now) {
      var p = Math.min((now - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * e) + (p === 1 ? suffix : '');
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  var counters = $$('[data-count]');
  if ('IntersectionObserver' in window) {
    var co = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        runCounter(en.target); co.unobserve(en.target);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { co.observe(el); });
  } else counters.forEach(runCounter);

  /* подсветка за курсором в hero */
  var glow = $('#heroGlow'), hero = $('#hero');
  if (glow && hero && !reduced && matchMedia('(pointer:fine)').matches) {
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      glow.style.transform = 'translate(' + (e.clientX - r.left) + 'px,' + (e.clientY - r.top) + 'px) translate(-50%,-50%)';
    });
  }

  /* длина штрихов для анимации чертежа */
  if (!reduced) {
    $$('.plan path, .plan rect, .plan circle').forEach(function (el) {
      try { el.style.setProperty('--len', Math.ceil(el.getTotalLength ? el.getTotalLength() : 2000)); }
      catch (e) { /* rect/circle без getTotalLength — остаётся значение по умолчанию */ }
    });
  }

  /* ---------------------------------------------------------
     КАЛЬКУЛЯТОР
     --------------------------------------------------------- */
  var form = $('#calcForm');
  var areaRange = $('#areaRange'), areaNum = $('#areaNum'), areaHint = $('#areaHint');
  var sumPrice = $('#sumPrice'), sumPer = $('#sumPer'), sumRows = $('#sumRows');
  var sumTerm = $('#sumTerm'), sumArea = $('#sumArea'), calcNote = $('#calcNote');
  var userOpts = {};   // опции, выбранные вручную
  var lastCalc = null;

  function area() {
    var v = parseInt(areaNum.value, 10);
    if (isNaN(v)) v = CALC.area.def;
    return Math.min(CALC.area.max, Math.max(CALC.area.min, v));
  }

  function setArea(v, from) {
    v = Math.min(CALC.area.max, Math.max(CALC.area.min, v || CALC.area.min));
    if (from !== 'range') areaRange.value = v;
    if (from !== 'num') areaNum.value = v;
    var p = ((v - CALC.area.min) / (CALC.area.max - CALC.area.min)) * 100;
    areaRange.style.setProperty('--p', p + '%');
  }

  function volume(a) {
    var hit = null;
    (CALC.volumeDiscount || []).forEach(function (d) { if (a >= d.from) hit = d; });
    return hit;
  }

  function compute() {
    var a = area();
    var objKey = (form.querySelector('input[name="obj"]:checked') || {}).value || 'flat';
    var pkgKey = (form.querySelector('input[name="pkg"]:checked') || {}).value || 'classic';
    var urgKey = (form.querySelector('input[name="urg"]:checked') || {}).value || 'normal';

    var obj = CALC.objects[objKey], pkg = CALC.packages[pkgKey], urg = CALC.urgency[urgKey];
    var included = pkg.includes || [];

    /* синхронизируем чекбоксы с пакетом */
    var chosen = [];
    $$('#optRow .opt').forEach(function (label) {
      var box = label.querySelector('input');
      var key = box.value;
      var isIncl = included.indexOf(key) !== -1;
      var priceEl = label.querySelector('i[data-price]');

      label.classList.toggle('is-incl', isIncl);
      box.disabled = isIncl;
      box.checked = isIncl || !!userOpts[key];
      if (priceEl) priceEl.textContent = isIncl ? 'в пакете' : '+' + money(CALC.options[key].price) + ' ₸/м²';
      if (box.checked && !isIncl) chosen.push(key);
    });

    /* цена за м² */
    var perMin = pkg.min, perMax = pkg.max;
    chosen.forEach(function (k) { perMin += CALC.options[k].price; perMax += CALC.options[k].price; });

    var disc = volume(a);
    var k = obj.k * urg.k * (disc ? disc.k : 1);
    var totalMin = perMin * a * k;
    var totalMax = perMax * a * k;

    /* срок */
    var weeks = pkg.weeks + Math.round(a / 120);
    chosen.forEach(function (key) { weeks += CALC.options[key].weeks; });
    weeks = Math.max(1, Math.round(weeks * urg.weeksK));

    return {
      area: a, obj: obj, pkg: pkg, urg: urg, disc: disc, chosen: chosen,
      perMin: perMin * k, perMax: perMax * k,
      min: totalMin, max: totalMax,
      weeks: weeks, weeksLabel: weeks + NBSP + plural(weeks, 'неделя', 'недели', 'недель')
    };
  }

  function render() {
    var r = compute();
    lastCalc = r;

    sumPrice.textContent = money(r.min) + ' — ' + money(r.max) + NBSP + '₸';
    sumPer.textContent = 'примерно ' + money(r.perMin) + '–' + money(r.perMax) + NBSP + '₸ за м²';

    var rows = [
      ['Объект', r.obj.label],
      ['Пакет', r.pkg.label]
    ];
    if (r.chosen.length) {
      rows.push(['Доп. опции', r.chosen.length + NBSP + plural(r.chosen.length, 'опция', 'опции', 'опций')]);
    }
    if (r.urg.k !== 1) rows.push(['Срочность', '+' + Math.round((r.urg.k - 1) * 100) + '%']);

    sumRows.innerHTML = '';
    rows.forEach(function (row) {
      var d = document.createElement('div');
      d.innerHTML = '<dt>' + row[0] + '</dt><dd>' + row[1] + '</dd>';
      sumRows.appendChild(d);
    });
    if (r.disc) {
      var d2 = document.createElement('div');
      d2.className = 'is-disc';
      d2.innerHTML = '<dt>Скидка за объём</dt><dd>−' + Math.round((1 - r.disc.k) * 100) + '%</dd>';
      sumRows.appendChild(d2);
    }

    sumTerm.textContent = 'срок проекта ' + r.weeksLabel;
    sumArea.textContent = r.area + NBSP + 'м²';

    areaHint.textContent = r.disc
      ? 'Применена ' + r.disc.label
      : 'Скидка за объём начинается со 150 м²';
    areaHint.classList.toggle('is-on', !!r.disc);

  }

  if (form) {
    setArea(CALC.area.def);

    form.addEventListener('change', function (e) {
      if (e.target.name === 'opt' && !e.target.disabled) {
        userOpts[e.target.value] = e.target.checked;
      }
      render();
    });

    areaRange.addEventListener('input', function () { setArea(+areaRange.value, 'range'); render(); });
    areaNum.addEventListener('input', function () {
      var v = parseInt(areaNum.value, 10);
      if (!isNaN(v)) { setArea(v, 'num'); render(); }
    });
    areaNum.addEventListener('blur', function () { setArea(area()); render(); });

    render();
  }

  /* Тарифы: список «что входит» прячем под спойлер, чтобы три карточки
     помещались в один экран телефона. На десктопе спойлер раскрыт. */
  $$('.price__c').forEach(function (card) {
    var list = card.querySelector('ul');
    if (!list || card.querySelector('.price__more')) return;
    var d = document.createElement('details');
    d.className = 'price__more';
    var sum = document.createElement('summary');
    sum.textContent = 'Что входит';
    d.appendChild(sum);
    list.parentNode.insertBefore(d, list);
    d.appendChild(list);
  });
  var prices = $$('.price__more');
  function syncPrices() { prices.forEach(function (d) { d.open = !MOBILE.matches; }); }

  /* ---------------------------------------------------------
     Калькулятор как пошаговая форма
     --------------------------------------------------------- */
  var steps   = $$('.step');
  var wizNow  = $('#wizNow'),  wizTotal = $('#wizTotal');
  var wizTitle= $('#wizTitle'), wizBar  = $('#wizBar');
  var wizBack = $('#wizBack'),  wizNext = $('#wizNext');
  var cNameEl = $('#cName'),    cPhoneEl = $('#cPhone');
  var calcNote = $('#calcNote'), resDone = $('#resDone');
  var CONTACTS = steps.length - 2;          /* предпоследний шаг — контакты */
  var RESULT   = steps.length - 1;          /* последний — расчёт */
  var cur = 0, sending = false;

  function showStep(n) {
    cur = Math.max(0, Math.min(RESULT, n));
    steps.forEach(function (el, i) { el.classList.toggle('is-on', i === cur); });

    var isRes = (cur === RESULT);
    var count = $('.wiz__count');
    if (count)    count.hidden = isRes;          /* результат — не шаг */
    if (wizNow)   wizNow.textContent = cur + 1;
    if (wizTotal) wizTotal.textContent = RESULT; /* шагов столько, сколько заполняет человек */
    if (wizTitle) wizTitle.textContent = steps[cur].getAttribute('data-title') || '';
    if (wizBar)   wizBar.style.width = (isRes ? 100 : (cur + 1) / RESULT * 100) + '%';

    if (wizBack) wizBack.hidden = (cur === 0 || cur === RESULT);
    if (wizNext) {
      wizNext.hidden = (cur === RESULT);
      wizNext.textContent = (cur === CONTACTS) ? 'Показать расчёт' : 'Далее';
    }
  }

  function goNext() {
    if (sending) return;

    if (cur === CONTACTS) {
      var digits = (cPhoneEl.value || '').replace(/\D/g, '');
      if (digits.length !== 11) {
        cPhoneEl.classList.add('is-err');
        cPhoneEl.focus();
        calcNote.textContent = 'Укажите телефон — на него перезвонит менеджер.';
        calcNote.classList.add('is-err');
        return;
      }
      cPhoneEl.classList.remove('is-err');
      calcNote.classList.remove('is-err');

      var r = lastCalc || compute();
      var payload = {
        source: 'Калькулятор на сайте',
        name: cNameEl.value.trim() || '—',
        phone: cPhoneEl.value,
        type: r.obj.label,
        calc: [
          ['Площадь', r.area + ' м²'],
          ['Пакет', r.pkg.label],
          ['Опции', r.chosen.length ? r.chosen.map(function (k) { return CALC.options[k].label; }).join(', ') : 'нет'],
          ['Сроки', r.urg.label],
          ['Стоимость', money(r.min) + ' — ' + money(r.max) + ' ₸'],
          ['Срок проекта', r.weeksLabel]
        ]
      };

      sending = true;
      wizNext.disabled = true;
      wizNext.textContent = 'Отправляем…';

      sendLead(payload).then(function (res) {
        track('lead_calc', { via: res.via, pkg: r.pkg.label, area: r.area, min: Math.round(r.min) });
        if (resDone) resDone.textContent = 'Заявка у менеджера — перезвоним в течение рабочего дня';
      }).catch(function (err) {
        /* расчёт показываем в любом случае: контакты человек уже оставил */
        if (resDone) resDone.textContent = 'Расчёт готов. Если не перезвоним — наберите нас сами';
        console.error('[ARCH] lead error:', err);
      }).then(function () {
        sending = false;
        wizNext.disabled = false;
        render();
        showStep(RESULT);
        toast('Расчёт готов');
      });
      return;
    }

    showStep(cur + 1);
  }

  maskPhone(cPhoneEl);
  maskPhone($('#fphone'));

  if (wizNext) wizNext.addEventListener('click', goNext);
  if (wizBack) wizBack.addEventListener('click', function () { showStep(cur - 1); });
  if (steps.length) showStep(0);

  /* кнопки «Рассчитать» в тарифах ведут на нужный шаг */

  $$('[data-pkg]').forEach(function (a) {
    a.addEventListener('click', function () {
      var el = form.querySelector('input[name="pkg"][value="' + a.getAttribute('data-pkg') + '"]');
      if (el) { el.checked = true; render(); }
      if (steps.length) showStep(0);
    });
  });

  /* ---------------------------------------------------------
     Кейсы: фильтр + «показать ещё» + лайтбокс
     --------------------------------------------------------- */
  var chips = $$('.chip'), cases = $$('.case');
  var casesMore = $('#casesMore'), casesLeft = $('#casesLeft');
  var LIMIT = 3;
  var expanded = false;
  var currentFilter = 'all';

  function applyCases() {
    var matched = cases.filter(function (c) {
      return currentFilter === 'all' || c.getAttribute('data-c') === currentFilter;
    });
    var limit = (MOBILE.matches && !expanded) ? LIMIT : matched.length;

    cases.forEach(function (c) { c.classList.add('is-hidden'); });
    matched.slice(0, limit).forEach(function (c) { c.classList.remove('is-hidden'); });

    var left = matched.length - limit;
    if (casesMore) {
      casesMore.classList.toggle('is-on', left > 0);
      if (casesLeft) casesLeft.textContent = left > 0 ? '(' + left + ')' : '';
    }
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      currentFilter = chip.getAttribute('data-f');
      expanded = false;
      chips.forEach(function (c) {
        var on = c === chip;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-selected', String(on));
      });
      applyCases();
      track('cases_filter', { filter: currentFilter });
    });
  });

  if (casesMore) {
    casesMore.addEventListener('click', function () {
      expanded = true;
      applyCases();
      track('cases_more');
    });
  }
  if (MOBILE.addEventListener) MOBILE.addEventListener('change', applyCases);
  applyCases();

  syncPrices();
  if (MOBILE.addEventListener) MOBILE.addEventListener('change', syncPrices);

  var lb = $('#lightbox'), lbImg = $('#lbImg'), lbTitle = $('#lbTitle'),
      lbMeta = $('#lbMeta'), lbScope = $('#lbScope'), lbClose = $('#lbClose');

  function openCase(card) {
    if (!lb || !lb.showModal) return;
    var imgClass = (card.querySelector('.case__img').className.match(/case__img--\w/) || [''])[0];
    lbImg.className = 'lb__img case__img ' + imgClass;
    lbTitle.textContent = card.getAttribute('data-title') || '';
    lbMeta.textContent = card.getAttribute('data-meta') || '';
    lbScope.innerHTML = '';
    (card.getAttribute('data-scope') || '').split('|').forEach(function (t) {
      if (!t) return;
      var li = document.createElement('li'); li.textContent = t; lbScope.appendChild(li);
    });
    lb.showModal();
  }

  cases.forEach(function (card) {
    card.addEventListener('click', function () { openCase(card); });
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCase(card); }
    });
  });
  if (lb) {
    lbClose.addEventListener('click', function () { lb.close(); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });
    $('#lbCta').addEventListener('click', function () { lb.close(); });
  }

  /* FAQ: открыт один вопрос за раз */
  var qs = $$('.q');
  qs.forEach(function (q) {
    q.addEventListener('toggle', function () {
      if (!q.open) return;
      qs.forEach(function (o) { if (o !== q) o.open = false; });
    });
  });

  /* ---------------------------------------------------------
     Форма заявки
     --------------------------------------------------------- */
  var leadForm = $('#leadForm'), formMsg = $('#formMsg'), leadBtn = $('#leadBtn');
  if (leadForm) {
    leadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = leadForm.elements.name, phone = leadForm.elements.phone;
      var ok = true;

      if (!name.value.trim()) { name.classList.add('is-err'); ok = false; } else name.classList.remove('is-err');
      var digits = phone.value.replace(/\D/g, '');
      if (digits.length !== 11) { phone.classList.add('is-err'); ok = false; } else phone.classList.remove('is-err');
      if (!ok) { (leadForm.querySelector('.is-err') || name).focus(); return; }

      var payload = {
        source: 'Форма «Бесплатный замер»',
        name: name.value.trim(),
        phone: phone.value,
        type: leadForm.elements.type.value,
        msg: leadForm.elements.msg.value.trim()
      };

      leadBtn.disabled = true;
      leadBtn.textContent = 'Отправляем…';
      formMsg.hidden = false;
      formMsg.className = 'form__msg';
      formMsg.textContent = 'Отправляем заявку…';

      sendLead(payload).then(function (res) {
        formMsg.className = 'form__msg is-ok';
        formMsg.textContent = res.via === 'whatsapp'
          ? 'Открыли WhatsApp с готовым сообщением — осталось нажать «Отправить».'
          : 'Спасибо! Заявка отправлена, свяжемся в течение рабочего дня.';
        leadForm.reset();
        toast('Заявка отправлена');
        track('lead_form', { via: res.via, type: payload.type });
      }).catch(function (err) {
        formMsg.className = 'form__msg is-err';
        formMsg.textContent = 'Не удалось отправить. Позвоните нам: ' + (CFG.contacts && CFG.contacts.phone || '');
        console.error('[ARCH] lead error:', err);
      }).then(function () {
        leadBtn.disabled = false;
        leadBtn.textContent = 'Отправить заявку';
      });
    });
  }

  /* реквизиты в подвале: на мобильном свёрнуты, на десктопе раскрыты */
  var req = $('.ft__col--req');
  if (req) {
    var syncReq = function () { req.open = !MOBILE.matches; };
    syncReq();
    if (MOBILE.addEventListener) MOBILE.addEventListener('change', syncReq);
  }

  /* год в подвале */
  var yr = $('#yr');
  if (yr) yr.textContent = new Date().getFullYear();
})();
