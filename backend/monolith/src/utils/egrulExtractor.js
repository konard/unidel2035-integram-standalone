// ЕГРЮЛ Data Extractor - Extract all 59 fields from ЕГРЮЛ JSON
// Based on EGRUL_PARAMETERS_MAP.md (parameters 214633-214691)

/**
 * Extract value from nested object using dot notation path
 * @param {Object} obj - Source object
 * @param {string} path - Path like "СвЮЛ.@attributes.ОГРН"
 * @returns {any} Extracted value or null
 */
function getByPath(obj, path) {
  if (!obj || !path) return null

  const parts = path.split('.')
  let current = obj

  for (const part of parts) {
    if (current === null || current === undefined) return null
    current = current[part]
  }

  return current || null
}

/**
 * Format full address from ЕГРЮЛ address fields
 * @param {Object} addressData - СвАдресЮЛ.АдресРФ object
 * @returns {string} Formatted address
 */
function formatAddress(addressData) {
  if (!addressData) return null

  const parts = []
  const attrs = addressData['@attributes'] || {}

  if (attrs.Индекс) parts.push(attrs.Индекс)

  const region = addressData.Регион?.['@attributes']?.НаимРегион
  if (region) parts.push(region)

  const street = addressData.Улица?.['@attributes']
  if (street) {
    const streetStr = `${street.ТипУлица || ''} ${street.НаимУлица || ''}`.trim()
    if (streetStr) parts.push(streetStr)
  }

  if (attrs.Дом) parts.push(`д. ${attrs.Дом}`)

  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * Extract all ЕГРЮЛ fields according to parameter mapping (214633-214691)
 * @param {Object} egrulData - Full ЕГРЮЛ API response
 * @returns {Object} Extracted fields with parameter IDs as keys
 */
function extractAllFields(egrulData) {
  const svYul = egrulData?.СвЮЛ
  if (!svYul) {
    throw new Error('Invalid ЕГРЮЛ data: missing СвЮЛ')
  }

  const attrs = svYul['@attributes'] || {}

  const fields = {}

  // 1. Основные реквизиты (@attributes)
  fields['214633'] = attrs.ДатаВып || null                    // Дата выписки ЕГРЮЛ
  fields['214634'] = attrs.ОГРН || null                       // ОГРН
  fields['214635'] = attrs.ДатаОГРН || null                   // Дата присвоения ОГРН
  fields['214636'] = attrs.ИНН || null                        // ИНН
  fields['214637'] = attrs.КПП || null                        // КПП
  fields['214638'] = attrs.КодОПФ || null                     // Код ОПФ
  fields['214639'] = attrs.ПолнНаимОПФ || null                // Полное наименование ОПФ

  // 2. Наименование (СвНаимЮЛ)
  const svNaim = svYul.СвНаимЮЛ?.['@attributes'] || {}
  fields['214640'] = svNaim.НаимЮЛПолн || null                // Полное наименование организации

  const svNaimSokr = svYul.СвНаимЮЛ?.СвНаимЮЛСокр?.['@attributes'] || {}
  fields['214641'] = svNaimSokr.НаимСокр || null              // Сокращенное наименование

  // 3. Адрес (СвАдресЮЛ)
  const adresRF = svYul.СвАдресЮЛ?.АдресРФ
  const adresAttrs = adresRF?.['@attributes'] || {}
  const region = adresRF?.Регион?.['@attributes'] || {}
  const ulica = adresRF?.Улица?.['@attributes'] || {}

  fields['214642'] = adresAttrs.Индекс || null                // Почтовый индекс
  fields['214643'] = adresAttrs.КодРегион || null             // Код региона
  fields['214644'] = region.НаимРегион || null                // Наименование региона
  fields['214645'] = ulica.ТипУлица || null                   // Тип улицы
  fields['214646'] = ulica.НаимУлица || null                  // Наименование улицы
  fields['214647'] = adresAttrs.Дом || null                   // Дом
  fields['214648'] = adresAttrs.КодАдрКладр || null           // Код адреса КЛАДР
  fields['214649'] = formatAddress(adresRF)                   // Полный адрес (форматированный)

  // 4. Сведения об образовании (СвОбрЮЛ)
  const svObr = svYul.СвОбрЮЛ?.['@attributes'] || {}
  const spObr = svYul.СвОбрЮЛ?.СпОбрЮЛ?.['@attributes'] || {}

  fields['214650'] = svObr.РегНом || null                     // Регистрационный номер
  fields['214651'] = svObr.ДатаРег || null                    // Дата регистрации
  fields['214652'] = svObr.НаимРО || null                     // Наименование регистрирующего органа
  fields['214653'] = spObr.КодСпОбрЮЛ || null                 // Код способа образования
  fields['214654'] = spObr.НаимСпОбрЮЛ || null                // Способ образования

  // 5. Регистрирующий орган (СвРегОрг)
  const svRegOrg = svYul.СвРегОрг?.['@attributes'] || {}

  fields['214655'] = svRegOrg.КодНО || null                   // Код налогового органа (регистрация)
  fields['214656'] = svRegOrg.НаимНО || null                  // Наименование налогового органа (регистрация)
  fields['214657'] = svRegOrg.АдрРО || null                   // Адрес регистрирующего органа

  // 6. Учет в налоговом органе (СвУчетНО)
  const svUchet = svYul.СвУчетНО?.['@attributes'] || {}
  const svNO = svYul.СвУчетНО?.СвНО?.['@attributes'] || {}

  fields['214658'] = svUchet.ДатаПостУч || null               // Дата постановки на учет
  fields['214659'] = svNO.КодНО || null                       // Код налогового органа учета
  fields['214660'] = svNO.НаимНО || null                      // Наименование налогового органа учета

  // 7. Пенсионный фонд (СвРегПФ)
  const svPF = svYul.СвРегПФ?.['@attributes'] || {}
  const svOrgPF = svYul.СвРегПФ?.СвОргПФ?.['@attributes'] || {}

  fields['214661'] = svPF.РегНомПФ || null                    // Рег. номер в ПФ
  fields['214662'] = svPF.ДатаРег || null                     // Дата регистрации в ПФ
  fields['214663'] = svOrgPF.КодПФ || null                    // Код органа ПФ
  fields['214664'] = svOrgPF.НаимПФ || null                   // Наименование органа ПФ

  // 8. Фонд социального страхования (СвРегФСС)
  const svFSS = svYul.СвРегФСС?.['@attributes'] || {}
  const svOrgFSS = svYul.СвРегФСС?.СвОргФСС?.['@attributes'] || {}

  fields['214665'] = svFSS.РегНомФСС || null                  // Рег. номер в ФСС
  fields['214666'] = svFSS.ДатаРег || null                    // Дата регистрации в ФСС
  fields['214667'] = svOrgFSS.КодФСС || null                  // Код органа ФСС
  fields['214668'] = svOrgFSS.НаимФСС || null                 // Наименование органа ФСС

  // 9. Уставный капитал (СвУстКап)
  const svKap = svYul.СвУстКап?.['@attributes'] || {}

  fields['214669'] = svKap.НаимВидКап || null                 // Вид капитала
  fields['214670'] = svKap.СумКап || null                     // Сумма уставного капитала

  // 10. Должностные лица (СведДолжнФЛ)
  const svFL = svYul.СведДолжнФЛ?.СвФЛ?.['@attributes'] || {}
  const svDolzhn = svYul.СведДолжнФЛ?.СвДолжн?.['@attributes'] || {}
  const svPol = svYul.СведДолжнФЛ?.СвПолФЛ?.['@attributes'] || {}
  const svGrazh = svYul.СведДолжнФЛ?.СвГраждФЛ?.['@attributes'] || {}

  fields['214671'] = svFL.Фамилия || null                     // Фамилия руководителя
  fields['214672'] = svFL.Имя || null                         // Имя руководителя
  fields['214673'] = svFL.Отчество || null                    // Отчество руководителя
  fields['214674'] = svFL.ИННФЛ || null                       // ИНН руководителя
  fields['214675'] = svDolzhn.ВидДолжн || null                // Код должности
  fields['214676'] = svDolzhn.НаимДолжн || null               // Наименование должности
  fields['214677'] = svPol.Пол || null                        // Пол руководителя
  fields['214678'] = svGrazh.КодГражд || null                 // Код гражданства

  // 11. Держатель реестра акционеров (СвДержРеестрАО)
  const derzhReest = svYul.СвДержРеестрАО?.ДержРеестрАО?.['@attributes'] || {}

  fields['214679'] = derzhReest.ОГРН || null                  // ОГРН держателя реестра
  fields['214680'] = derzhReest.ИНН || null                   // ИНН держателя реестра
  fields['214681'] = derzhReest.НаимЮЛПолн || null            // Наименование держателя реестра

  // 12. ОКВЭД (СвОКВЭД)
  const okvedOsn = svYul.СвОКВЭД?.СвОКВЭДОсн?.['@attributes'] || {}
  const okvedDop = svYul.СвОКВЭД?.СвОКВЭДДоп

  fields['214682'] = okvedOsn.КодОКВЭД || null                // Код основного ОКВЭД
  fields['214683'] = okvedOsn.НаимОКВЭД || null               // Наименование основного ОКВЭД
  fields['214684'] = okvedOsn.ПрВерсОКВЭД || null             // Версия ОКВЭД

  // Дополнительные ОКВЭД (JSON array)
  if (okvedDop) {
    const dopArray = Array.isArray(okvedDop) ? okvedDop : [okvedDop]
    fields['214685'] = JSON.stringify(dopArray)
  } else {
    fields['214685'] = null
  }

  // 13. Лицензии (СвЛицензия)
  const licenses = svYul.СвЛицензия
  if (licenses) {
    const licArray = Array.isArray(licenses) ? licenses : [licenses]
    fields['214686'] = JSON.stringify(licArray)
  } else {
    fields['214686'] = null
  }

  // 14. Служебные поля
  fields['214687'] = 'https://egrul.itsoft.ru'                // Источник данных
  fields['214688'] = new Date().toISOString()                 // Дата последнего обновления

  // Статус организации (определяется по наличию данных о прекращении)
  const isDejstvuyushaya = !svYul.СвПрекрЮЛ && !attrs.СвПрекрЮЛ
  fields['214689'] = isDejstvuyushaya ? 'Действующая' : 'Ликвидирована'  // Статус организации

  // Полные данные JSON (ограничено 50000 символов для хранения)
  const fullJson = JSON.stringify(egrulData)
  fields['214690'] = fullJson.substring(0, 50000)             // Полные данные JSON

  fields['214691'] = isDejstvuyushaya ? 'Да' : 'Нет'          // Действующая организация (булево)

  return fields
}

/**
 * Get organization name from ЕГРЮЛ data
 * @param {Object} egrulData - Full ЕГРЮЛ API response
 * @returns {string} Organization name
 */
function getOrganizationName(egrulData) {
  const svYul = egrulData?.СвЮЛ
  if (!svYul) return 'Неизвестная организация'

  const fullName = svYul.СвНаимЮЛ?.['@attributes']?.НаимЮЛПолн
  const shortName = svYul.СвНаимЮЛ?.СвНаимЮЛСокр?.['@attributes']?.НаимСокр
  const ogrn = svYul['@attributes']?.ОГРН

  return fullName || shortName || `Организация ${ogrn}` || 'Неизвестная организация'
}

export {
  extractAllFields,
  getOrganizationName,
  getByPath,
  formatAddress
}
