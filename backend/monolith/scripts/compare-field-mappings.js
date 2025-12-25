/**
 * Сравнение существующего маппинга с извлеченными полями
 */

import fs from 'fs/promises'
import path from 'path'

// Импортируем существующий маппинг
const PARAM_ID_MAP_STATIC = {
  // Основные поля counterparty
  'inn': '209602',
  'fio': '209607',
  'registration_date': '209608',
  'years_from_registration': '209609',
  'ogrn': '209618',
  'available_count': '209621',

  // Company fields
  'company.kpp': '209626',
  'company.opf': '209629',
  'company.address': '209632',
  'company.registration_date': '209635',
  'company.years_from_registration': '209638',
  'company.okveds': '209641',
  'company.managers': '209644',
  'company.management_company': '209647',
  'company.dissolved_date': '209650',
  'company.ros_stat_codes': '209653',
  'company.owners': '209656',
  'company.charter_capital': '209659',
  'company.negative_lists': '209662',
  'company.workers_count': '209665',
  'company.contacts': '209668',
  'company.predecessors': '209671',
  'company.successors': '209674',
  'company.company_names.short_name': '209677',
  'company.company_names.full_name': '209680',
  'company.company_names.reversed_short_name': '209683',
  'company.status.code_egr': '209686',
  'company.status.status_eng_short': '209689',
  'company.status.status_rus_short': '209692',
  'company.status.status_egr': '209695',
  'company.status.active_status': '209698',
  'company.status.date_end': '209701',
  'company.tax_mode_info.publication_date': '209704',
  'company.tax_mode_info.eshn_sign': '209707',
  'company.tax_mode_info.usn_sign': '209710',
  'company.tax_mode_info.envd_sign': '209713',
  'company.tax_mode_info.srp_sign': '209716',
  'company.tax_mode_info.ausn_sign': '209719',
  'company.tax_mode_info.psn_sign': '209722',
  'company.tax_mode_info.npd_sign': '209725',
  'company.tax_mode_info.common_mode': '209728',

  // Individual (ИП) fields
  'individual.fio': '209731',
  'individual.registration_date': '209734',
  'individual.years_from_registration': '209737',
  'individual.vid_iptext': '209740',
  'individual.status.code_egr': '209743',
  'individual.status.status_eng_short': '209746',
  'individual.status.status_rus_short': '209749',
  'individual.status.status_egr': '209752',
  'individual.status.active_status': '209755',
  'individual.status.date_end': '209758',
  'individual.tax_mode_info.publication_date': '209761',
  'individual.tax_mode_info.eshn_sign': '209764',
  'individual.tax_mode_info.usn_sign': '209767',
  'individual.tax_mode_info.envd_sign': '209770',
  'individual.tax_mode_info.srp_sign': '209773',
  'individual.tax_mode_info.ausn_sign': '209776',
  'individual.tax_mode_info.psn_sign': '209779',
  'individual.tax_mode_info.npd_sign': '209782',
  'individual.tax_mode_info.common_mode': '209785',

  // Links
  'links.ogrn_root': '209788',
  'links.inn_root': '209791',
  'links.nodes_count': '209794',
  'links.edges_count': '209797',
  'links.nodes': '209800',
  'links.max_level': '209827',
  'links.edge_types': '209830'
}

async function compareFieldMappings() {
  console.log('🔍 Сравнение существующего маппинга с извлеченными полями\n')

  // Читаем извлеченные пути
  const pathsFile = path.join(process.cwd(), 'data/datanewton-analysis/field-paths.txt')
  const pathsContent = await fs.readFile(pathsFile, 'utf-8')
  const extractedPaths = pathsContent.split('\n').filter(Boolean).map(p => {
    // Убираем префикс "counterparty." и "links." и приводим к формату маппинга
    return p.replace(/^counterparty\./, '').replace(/^links\./, 'links.')
      .replace(/\[\]$/, '')  // Убираем [] из массивов
      .replace(/\[\d+\]\./, '.')  // Убираем индексы из массивов
  })

  // Сравниваем
  const existingKeys = Object.keys(PARAM_ID_MAP_STATIC)
  const existingSet = new Set(existingKeys)
  const extractedSet = new Set(extractedPaths)

  const missing = extractedPaths.filter(p => !existingSet.has(p))
  const extra = existingKeys.filter(k => !extractedSet.has(k) && k !== 'fio' && !k.startsWith('individual.'))

  console.log('📊 Статистика:')
  console.log(`  Существующих параметров: ${existingKeys.length}`)
  console.log(`  Извлеченных путей: ${extractedPaths.length}`)
  console.log(`  Совпадений: ${extractedPaths.filter(p => existingSet.has(p)).length}`)
  console.log(`  Отсутствующих в маппинге: ${missing.length}`)
  console.log(`  Лишних в маппинге (ИП+deprecated): ${extra.length}`)

  if (missing.length > 0) {
    console.log('\n❌ Отсутствующие параметры (нужно добавить):')
    missing.forEach((p, i) => console.log(`  ${i + 1}. ${p}`))
  }

  if (extra.length > 0) {
    console.log('\n⚠️  Параметры в маппинге, но не в извлеченных (устаревшие или ИП):')
    extra.slice(0, 20).forEach(p => console.log(`  - ${p}`))
  }

  // Генерируем новые ID для недостающих параметров
  const maxId = Math.max(...Object.values(PARAM_ID_MAP_STATIC).map(id => parseInt(id)))
  console.log(`\n🆕 Следующий свободный ID: ${maxId + 1}`)

  const newMappings = {}
  missing.forEach((path, index) => {
    newMappings[path] = String(maxId + 1 + index)
  })

  // Сохраняем результаты
  const outputFile = path.join(process.cwd(), 'data/datanewton-analysis/new-field-mappings.json')
  await fs.writeFile(outputFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    nextAvailableId: maxId + 1,
    missingCount: missing.length,
    missingFields: missing,
    proposedMappings: newMappings
  }, null, 2))

  console.log(`\n✅ Результаты сохранены: ${outputFile}`)
}

compareFieldMappings().catch(console.error)
