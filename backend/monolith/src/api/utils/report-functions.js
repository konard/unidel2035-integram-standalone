/**
 * Custom abn_* functions for report formula evaluation.
 *
 * Ported from PHP: integram-server/include/funcs.php
 *
 * These functions are called as post-processing steps on report column values
 * when a column's REP_COL_FUNC is set to an abn_* function name (e.g. abn_DATE2STR).
 * They are NOT SQL functions — they run in Node.js after the query returns.
 */

// ── Number-word lookup tables (Russian) ───────────────────────────────────

const _1_2  = { 1: 'одна ', 2: 'две ' };

const _1_19 = {
  1: 'один ', 2: 'два ', 3: 'три ', 4: 'четыре ', 5: 'пять ',
  6: 'шесть ', 7: 'семь ', 8: 'восемь ', 9: 'девять ', 10: 'десять ',
  11: 'одиннацать ', 12: 'двенадцать ', 13: 'тринадцать ', 14: 'четырнадцать ',
  15: 'пятнадцать ', 16: 'шестнадцать ', 17: 'семнадцать ', 18: 'восемнадцать ',
  19: 'девятнадцать ',
};

const des = {
  2: 'двадцать ', 3: 'тридцать ', 4: 'сорок ', 5: 'пятьдесят ',
  6: 'шестьдесят ', 7: 'семьдесят ', 8: 'восемьдесят ', 9: 'девяносто ',
};

const hang = {
  1: 'сто ', 2: 'двести ', 3: 'триста ', 4: 'четыреста ', 5: 'пятьсот ',
  6: 'шестьсот ', 7: 'семьсот ', 8: 'восемьсот ', 9: 'девятьсот ',
};

const namerub = { 1: 'рубль ', 2: 'рубля ', 3: 'рублей ' };
const nametho = { 1: 'тысяча ', 2: 'тысячи ', 3: 'тысяч ' };
const namemil = { 1: 'миллион ', 2: 'миллиона ', 3: 'миллионов ' };
const namemrd = { 1: 'миллиард ', 2: 'миллиарда ', 3: 'миллиардов ' };
const kopeek  = { 1: 'копейка', 2: 'копейки', 3: 'копеек' };

const months = {
  '01': 'января',  '02': 'февраля', '03': 'марта',
  '04': 'апреля',  '05': 'мая',     '06': 'июня',
  '07': 'июля',    '08': 'августа', '09': 'сентября',
  '10': 'октября', '11': 'ноября',  '12': 'декабря',
};

// ── semantic() — break a 0-999 number into Russian words ──────────────────
// PHP: function semantic($i, &$words, &$fem, $f)
// Returns { words, fem } where fem = 1|2|3 (grammatical form index)
// f = 0 → masculine (рублей), 1 → feminine (тысяч), 2+ → masculine (миллионов+)
function semantic(i, f) {
  let words = '';
  let fem = 3; // default: plural (5+)

  if (i >= 100) {
    const h = Math.trunc(i / 100);
    words += hang[h];
    i %= 100;
  }
  if (i >= 20) {
    const d = Math.trunc(i / 10);
    words += des[d];
    i %= 10;
  }

  switch (i) {
    case 1:  fem = 1; break;
    case 2:
    case 3:
    case 4:  fem = 2; break;
    default: fem = 3; break;
  }

  if (i) {
    if (i < 3 && f > 0) {
      // f >= 2 → masculine (миллион+), f === 1 → feminine (тысяча)
      if (f >= 2) {
        words += _1_19[i];
      } else {
        words += _1_2[i];
      }
    } else {
      words += _1_19[i];
    }
  }

  return { words, fem };
}

// ── abn_DATE2STR(val) — date → Russian string ────────────────────────────
// PHP input: date string like "2024-01-15" or "20240115" or similar
// PHP logic: substr($val, -2) = day, substr($val, 4, 2) = month, substr($val, 0, 4) = year
// Output: "15 января 2024 г."
function abn_DATE2STR(val) {
  if (!val) return '';
  const s = String(val).replace(/[^0-9]/g, ''); // strip non-digits → "20240115"
  if (s.length < 8) {
    // Try parsing as date object
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day   = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year  = d.getFullYear();
    return `${parseInt(day, 10)} ${months[month] || ''} ${year} г.`;
  }
  const year  = s.substring(0, 4);
  const month = s.substring(4, 6);
  const day   = s.substring(6, 8);
  return `${parseInt(day, 10)} ${months[month] || ''} ${year} г.`;
}

// ── abn_RUB2STR(amount) — rubles → Russian words ─────────────────────────
function abn_RUB2STR(L) {
  L = parseFloat(L) || 0;
  const kop = Math.round((L - Math.trunc(L)) * 100);
  L = Math.trunc(L);

  let s = '';

  if (L >= 1000000000) {
    const { words, fem } = semantic(Math.trunc(L / 1000000000), 3);
    s += words + namemrd[fem];
    L %= 1000000000;
  }

  if (L >= 1000000) {
    const { words, fem } = semantic(Math.trunc(L / 1000000), 2);
    s += words + namemil[fem];
    L %= 1000000;
    if (L === 0) s += 'рублей ';
  }

  if (L >= 1000) {
    const { words, fem } = semantic(Math.trunc(L / 1000), 1);
    s += words + nametho[fem];
    L %= 1000;
    if (L === 0) s += 'рублей ';
  }

  if (L !== 0) {
    const { words, fem } = semantic(L, 0);
    s += words + namerub[fem];
  }

  if (kop > 0) {
    const { fem } = semantic(kop, 1);
    s += kop + ' ' + kopeek[fem];
  } else {
    s += ' 00 копеек';
  }

  // Capitalize first letter
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── abn_NUM2STR(number) — integer → Russian words ────────────────────────
function abn_NUM2STR(L) {
  L = Math.trunc(parseFloat(L) || 0);
  let s = '';

  if (L >= 1000000000) {
    const { words, fem } = semantic(Math.trunc(L / 1000000000), 3);
    s += words + namemrd[fem];
    L %= 1000000000;
  }

  if (L >= 1000000) {
    const { words, fem } = semantic(Math.trunc(L / 1000000), 2);
    s += words + namemil[fem];
    L %= 1000000;
  }

  if (L >= 1000) {
    const { words, fem } = semantic(Math.trunc(L / 1000), 1);
    s += words + nametho[fem];
    L %= 1000;
  }

  if (L !== 0) {
    const { words } = semantic(L, 0);
    s += words;
  }

  // Capitalize first letter
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── abn_Translit(str) — Russian → Latin transliteration ──────────────────
const translitMap = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
  'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ы': 'y',
  'э': 'e', 'ю': 'yu', 'я': 'ya', 'ъ': '', 'ь': '',
};

function abn_Translit(s) {
  if (!s) return '';
  s = String(s).toLowerCase();
  // Replace newlines and spaces with underscore
  s = s.replace(/[\n\r ]/g, '_');
  // Transliterate character by character
  let result = '';
  for (const ch of s) {
    result += translitMap[ch] !== undefined ? translitMap[ch] : ch;
  }
  // Remove anything that is not alphanumeric, dash, or underscore
  result = result.replace(/[^0-9a-z\-_]/gi, '');
  return result;
}

// ── Registry: map function name → implementation ─────────────────────────

const ABN_POST_PROCESS_FUNCTIONS = {
  ABN_DATE2STR: abn_DATE2STR,
  ABN_NUM2STR:  abn_NUM2STR,
  ABN_RUB2STR:  abn_RUB2STR,
  ABN_TRANSLIT: abn_Translit,
};

// SQL-level abn_* functions that change which column is selected (not post-processing)
const ABN_SQL_FIELD_FUNCS = new Set([
  'ABN_ID', 'ABN_UP', 'ABN_TYP', 'ABN_ORD', 'ABN_REQ', 'ABN_BT',
  'ABN_ROWNUM', 'ABN_URL',
]);

/**
 * Check if a function name is an abn_* custom function (case-insensitive).
 */
function isAbnFunction(funcName) {
  if (!funcName) return false;
  const upper = funcName.toUpperCase();
  return upper.startsWith('ABN_');
}

/**
 * Check if a function name is a post-processing abn_* function.
 */
function isAbnPostProcessFunction(funcName) {
  if (!funcName) return false;
  return funcName.toUpperCase() in ABN_POST_PROCESS_FUNCTIONS;
}

/**
 * Apply abn_* post-processing function to a value.
 * @param {string} funcName - e.g. "abn_DATE2STR" or "ABN_DATE2STR"
 * @param {*} value - the cell value to transform
 * @returns {*} transformed value, or original if function not found
 */
function applyAbnFunction(funcName, value) {
  if (!funcName) return value;
  const fn = ABN_POST_PROCESS_FUNCTIONS[funcName.toUpperCase()];
  if (!fn) return value;
  return fn(value);
}

export {
  abn_DATE2STR,
  abn_RUB2STR,
  abn_NUM2STR,
  abn_Translit,
  semantic,
  isAbnFunction,
  isAbnPostProcessFunction,
  applyAbnFunction,
  ABN_POST_PROCESS_FUNCTIONS,
  ABN_SQL_FIELD_FUNCS,
};
