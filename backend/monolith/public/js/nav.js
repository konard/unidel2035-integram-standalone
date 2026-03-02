/**
 * nav.js — shared navigation bar for all Integram standalone templates.
 * Injects the legacy-style dark Bootstrap navbar (menu + user dropdown +
 * change-password modal) into any page.
 *
 * Requirements:
 *   - jQuery must be loaded before this script
 *   - The page must define `window.db`, `window.user`, `window.uid` globals
 *     (all templates do this in their first inline <script> block)
 *   - Bootstrap 4 CSS must be present (all templates load it)
 */
(function ($) {
  'use strict';
  if (!$ || !$.fn) { console.warn('nav.js: jQuery not found'); return; }
  if (document.getElementById('nav')) return; // already present (e.g. main.html)

  var _db   = window.db   || '';
  var _user = window.user || '';
  var _uid  = window.uid  || '';

  function _h(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Navbar HTML ────────────────────────────────────────────────────────────
  var navHtml = [
    '<nav id="nav" class="navbar shadow-sm navbar-expand-562 fixed-top dark navbar-fixed-top">',
      '<a id="nav-brand" class="navbar-brand" href="#">',
        '<img src="/i/lamp.png" width="30" loading="lazy" onerror="this.style.display=\'none\'"/>',
      '</a>',
      '<button id="nav-burger" class="navbar-toggler expand-menu" type="button" aria-label="Toggle navigation">',
        '<span class="navbar-toggler-icon">',
          '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 16 16"',
              ' style="shape-rendering:geometricprecision;margin-top:0">',
            '<path fill-rule="evenodd" fill="currentColor"',
              ' d="M2,12 C2,11.4477153 2.45576096,11 3.00247329,11 L12.9975267,11 C13.5511774,11',
              ' 14,11.4438648 14,12 C14,12.5522847 13.544239,13 12.9975267,13 L3.00247329,13',
              ' C2.44882258,13 2,12.5561352 2,12 Z M2,8 C2,7.44771525 2.45576096,7',
              ' 3.00247329,7 L12.9975267,7 C13.5511774,7 14,7.44386482 14,8 C14,8.55228475',
              ' 13.544239,9 12.9975267,9 L3.00247329,9 C2.44882258,9 2,8.55613518 2,8 Z',
              ' M2,4 C2,3.44771525 2.45576096,3 3.00247329,3 L12.9975267,3 C13.5511774,3',
              ' 14,3.44386482 14,4 C14,4.55228475 13.544239,5 12.9975267,5 L3.00247329,5',
              ' C2.44882258,5 2,4.55613518 2,4 Z"/>',
          '</svg>',
        '</span>',
      '</button>',
      '<div class="collapse navbar-collapse" id="navbarSupportedContent">',
        '<ul id="nav-menu-list" class="navbar-nav"></ul>',
      '</div>',
      '<div class="right-block" id="right_block">',
        '<div class="nav-item" id="nav-user-wrap" style="position:relative">',
          '<a class="user-link user-margin" href="#" id="nav-user-btn">',
            '<svg height="30" viewBox="0 0 18 20" fill="white" xmlns="http://www.w3.org/2000/svg">',
              '<path d="M17 19V17C17 15.9391 16.5786 14.9217 15.8284 14.1716C15.0783 13.4214',
                ' 14.0609 13 13 13H5C3.93913 13 2.92172 13.4214 2.17157 14.1716C1.42143 14.9217',
                ' 1 15.9391 1 17V19M13 5C13 7.20914 11.2091 9 9 9C6.79086 9 5 7.20914 5 5C5',
                ' 2.79086 6.79086 1 9 1C11.2091 1 13 2.79086 13 5Z"',
                ' stroke="#fafafa" stroke-linecap="round" stroke-linejoin="round"/>',
            '</svg>',
          '</a>',
          '<div class="dropdown-menu dropdown-menu-right shadow" id="nav-user-menu"',
               ' style="display:none;position:absolute;right:0;top:100%;z-index:9999;',
                       'background:#fff;min-width:180px;border:1px solid rgba(0,0,0,.15);',
                       'border-radius:.25rem;padding:.5rem 0;">',
            '<span class="dropdown-item text-muted" id="nav-username" style="font-size:12px"></span>',
            '<div class="dropdown-divider"></div>',
            '<a class="dropdown-item" target="_blank" href="https://help.ideav.online/">\u2753 \u041f\u043e\u043c\u043e\u0449\u044c / Help</a>',
            '<a class="dropdown-item" id="nav-dict-link" href="#">\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u0442\u0430\u0431\u043b\u0438\u0446 / Tables</a>',
            '<a class="dropdown-item" onclick="navToggleLocale()">EN/RU</a>',
            '<a class="dropdown-item" onclick="navShowChangePwd()">\u0421\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c / Change password</a>',
            '<a class="dropdown-item" onclick="navDoExit()">\u21a6 \u0412\u044b\u0445\u043e\u0434 / Exit</a>',
          '</div>',
        '</div>',
      '</div>',
    '</nav>'
  ].join('');

  // ── Change-password modal ──────────────────────────────────────────────────
  var pwdModalHtml = [
    '<div id="nav-pwd-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;',
                                   'z-index:10000;background:rgba(255,255,255,.5);"',
         ' onclick="$(\'#nav-pwd-modal\').hide()">',
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;">',
        '<div style="border:1px solid gray;border-radius:4px;background:#fbfbfb;',
                    'max-width:348px;width:90%;padding:24px;"',
             ' onclick="event.stopPropagation()">',
          '<h5 class="text-center mb-3">\u0421\u043c\u0435\u043d\u0430 \u043f\u0430\u0440\u043e\u043b\u044f / Password change</h5>',
          '<div id="nav-pwd-msg" class="alert" style="display:none"></div>',
          '<label class="mb-0" style="font-size:90%;color:gray">\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043f\u0430\u0440\u043e\u043b\u044c / Current password</label>',
          '<input type="password" id="nav-old-pwd" class="form-control mb-2">',
          '<label class="mb-0" style="font-size:90%;color:gray">\u041d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c / New password</label>',
          '<input type="password" id="nav-new-pwd" class="form-control mb-2">',
          '<label class="mb-0" style="font-size:90%;color:gray">\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 / Repeat</label>',
          '<input type="password" id="nav-new-again" class="form-control mb-3">',
          '<div class="row">',
            '<div class="col-6"><button class="btn btn-primary btn-block" type="button"',
                ' onclick="navChangePwd()">\u0421\u043c\u0435\u043d\u0438\u0442\u044c / Change</button></div>',
            '<div class="col-6"><button class="btn btn-outline-secondary btn-block" type="button"',
                ' onclick="$(\'#nav-pwd-modal\').hide()">\u041e\u0442\u043c\u0435\u043d\u0430 / Cancel</button></div>',
          '</div>',
        '</div>',
      '</div>',
    '</div>'
  ].join('');

  // ── Insert into page ───────────────────────────────────────────────────────
  $('body').prepend(pwdModalHtml).prepend(navHtml);
  $('body').css('padding-top', '56px');

  // Fix links
  $('#nav-brand').attr('href', 'main.html?db=' + encodeURIComponent(_db));
  $('#nav-dict-link').attr('href', 'dict.html?db=' + encodeURIComponent(_db));
  if (_user || _uid) $('#nav-username').text(_user || ('uid: ' + _uid));

  // ── User dropdown (no Bootstrap JS needed) ─────────────────────────────────
  $('#nav-user-btn').on('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    $('#nav-user-menu').toggle();
  });
  $(document).on('click', function (e) {
    if (!$(e.target).closest('#nav-user-wrap').length) {
      $('#nav-user-menu').hide();
    }
  });

  // ── Burger (mobile) ────────────────────────────────────────────────────────
  $('#nav-burger').on('click', function () {
    $('#navbarSupportedContent').toggleClass('show');
  });
  $(document).on('click', function (e) {
    if ($('#navbarSupportedContent').hasClass('show') &&
        !$(e.target).closest('#nav').length) {
      $('#navbarSupportedContent').removeClass('show');
    }
  });

  // ── Load menu from /{db}/?JSON (role menu, matches PHP MyRoleMenu) ──────────
  if (_db) {
    $.getJSON('/' + _db + '/?JSON', function (data) {
      var menuData = data['&main.myrolemenu'] || {};
      var hrefs = menuData.href || [];
      var names = menuData.name || [];
      var $list = $('#nav-menu-list');

      // Convert PHP-style href to Node.js template URL
      function toNodeHref(phpHref) {
        if (!phpHref) return '#';
        // object/N → object.html?db=...&type=N
        var om = phpHref.match(/^object\/(\d+)$/);
        if (om) return 'object.html?db=' + encodeURIComponent(_db) + '&type=' + om[1] + '&up=0';
        // single-word pages: dict, edit_types, sql, upload, smartq, dir_admin, report, bi
        var page = phpHref.replace(/^integram\/[^/]+\//, '').split('/')[0];
        var singlePageMap = {
          dict: 'dict.html', edit_types: 'edit_types.html', sql: 'sql.html',
          upload: 'upload.html', smartq: 'smartq.html', dir_admin: 'dir_admin.html',
          report: 'report.html', bi: 'bi.html', welcome: 'main.html',
          info: 'info.html', table: 'dict.html'
        };
        if (singlePageMap[page]) return singlePageMap[page] + '?db=' + encodeURIComponent(_db);
        // external / unknown: build absolute path
        if (phpHref.charAt(0) === '/') return phpHref;
        return '/' + _db + '/' + phpHref;
      }

      for (var i = 0; i < hrefs.length; i++) {
        var name = names[i] || hrefs[i] || '';
        if (!name) continue;
        var href = toNodeHref(hrefs[i]);
        $list.append(
          '<li class="nav-item"><a class="nav-link" href="' + _h(href) + '">' +
          _h(name) + '</a></li>'
        );
      }
    }).fail(function (xhr) {
      if (xhr.status === 401 || xhr.status === 403) {
        location.href = 'login.html?db=' + encodeURIComponent(_db);
      }
    });
  }

  // ── Global functions ───────────────────────────────────────────────────────

  window.navDoExit = function () {
    document.cookie = _db + '=;Path=/;max-age=0';
    document.cookie = _db + '_token=;Path=/;max-age=0';
    $.get('/' + _db + '/exit', function () {
      localStorage.removeItem(_db + '_token');
      localStorage.removeItem(_db + '_xsrf');
      localStorage.removeItem(_db + '_userId');
      localStorage.removeItem(_db + '_user');
      location.href = 'login.html?db=' + encodeURIComponent(_db);
    }).fail(function () {
      localStorage.removeItem(_db + '_token');
      location.href = 'login.html?db=' + encodeURIComponent(_db);
    });
  };

  window.navToggleLocale = function () {
    var m = document.cookie.match('(^|;)\\s*' + _db + '_locale\\s*=\\s*([^;]+)');
    var cur = m ? m[2] : 'RU';
    document.cookie = _db + '_locale=' + (cur === 'RU' ? 'EN' : 'RU') + ';Path=/';
    location.reload();
  };

  window.navShowChangePwd = function () {
    $('#nav-pwd-modal').css('display', 'flex');
    $('#nav-old-pwd,#nav-new-pwd,#nav-new-again').val('');
    $('#nav-pwd-msg').hide();
  };

  window.navChangePwd = function () {
    var op = $('#nav-old-pwd').val(),
        np = $('#nav-new-pwd').val(),
        na = $('#nav-new-again').val();
    if (!op || !np || !na) {
      _pwdMsg('danger', '\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0432\u0441\u0435 \u043f\u043e\u043b\u044f / Please fill in the inputs');
      return;
    }
    if (np !== na) {
      _pwdMsg('danger', '\u041f\u0430\u0440\u043e\u043b\u0438 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u044e\u0442 / Passwords do not match');
      return;
    }
    var _xsrf = localStorage.getItem(_db + '_xsrf') || '';
    $.post('/' + _db + '/auth?JSON',
      { change: 1, login: _user, pwd: op, npw1: np, npw2: na, _xsrf: _xsrf },
      function (json) {
        if (json && json.msg) {
          if (json.msg.indexOf('[err') === -1) {
            _pwdMsg('success', json.msg);
            $('#nav-old-pwd,#nav-new-pwd,#nav-new-again').val('');
          } else {
            _pwdMsg('danger', json.msg.replace(/ ?\[.+\]/g, ''));
          }
          if (json.token) window.token = json.token;
          if (json.xsrf || json._xsrf) {
            var x = json.xsrf || json._xsrf;
            localStorage.setItem(_db + '_xsrf', x);
            window.xsrf = x;
          }
        } else {
          _pwdMsg('danger', '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c / Wrong password');
        }
      }
    ).fail(function () { _pwdMsg('danger', '\u041e\u0448\u0438\u0431\u043a\u0430 / Error'); });
  };

  function _pwdMsg(type, msg) {
    $('#nav-pwd-msg')
      .removeClass('alert-danger alert-success')
      .addClass('alert-' + type)
      .html(msg).show();
  }

}(window.jQuery));
