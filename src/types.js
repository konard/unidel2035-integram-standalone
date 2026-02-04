/**
 * Integram Type IDs - все 17 типов
 *
 * 2  - HTML       - HTML контент
 * 3  - SHORT      - Короткая строка (<255 символов)
 * 4  - DATETIME   - Дата и время
 * 5  - GRANT      - Права доступа (системный)
 * 6  - PWD        - Пароль
 * 7  - BUTTON     - Кнопка действия
 * 8  - CHARS      - Строка (без ограничения)
 * 9  - DATE       - Дата
 * 10 - FILE       - Файл
 * 11 - BOOLEAN    - Логическое значение
 * 12 - MEMO       - Многострочный текст
 * 13 - NUMBER     - Целое число
 * 14 - SIGNED     - Число с дробной частью
 * 15 - CALCULATABLE - Вычисляемое поле
 * 16 - REPORT_COLUMN - Колонка отчёта
 * 17 - PATH       - Путь к файлу
 * 18 - AI_CELL    - ИИ ячейка (AI Field Agent)
 */
export const TYPES = [
  { value: 2, label: 'HTML', icon: 'fa-code' },
  { value: 3, label: 'Короткая строка', icon: 'fa-text-width' },
  { value: 4, label: 'Дата и время', icon: 'fa-clock' },
  // { value: 5, label: 'Права доступа', icon: 'fa-shield-alt' }, // GRANT - скрыт (системный тип)
  { value: 6, label: 'Пароль', icon: 'fa-key' },
  { value: 7, label: 'Кнопка', icon: 'fa-mouse-pointer' },
  { value: 8, label: 'Строка', icon: 'fa-font' },
  { value: 9, label: 'Дата', icon: 'fa-calendar-alt' },
  { value: 10, label: 'Файл', icon: 'fa-file' },
  { value: 11, label: 'Логическое значение', icon: 'fa-check-circle' },
  { value: 12, label: 'Многострочный текст', icon: 'fa-align-left' },
  { value: 13, label: 'Целое число', icon: 'fa-hashtag' },
  { value: 14, label: 'Число с десятичной частью', icon: 'fa-calculator' },
  { value: 15, label: 'Вычисляемое поле', icon: 'fa-function' },
  // { value: 16, label: 'Колонка отчёта', icon: 'fa-columns' }, // REPORT_COLUMN - скрыт (системный тип)
  { value: 17, label: 'Путь к файлу', icon: 'fa-folder-open' },
  { value: 18, label: 'ИИ ячейка', icon: 'fa-brain' },
]

/*
const TYPES = [
	{
		value: 3,
		label: 'Короткая строка (до 127 символов)',
		icon: 'fa-text-width',
	},
	{ value: 8, label: 'Строка без ограничения длины', icon: 'fa-font' },
	{ value: 9, label: 'Дата', icon: 'fa-calendar-alt' },
	{ value: 13, label: 'Целое число', icon: 'fa-hashtag' },
	{ value: 14, label: 'Число с десятичной частью', icon: 'fa-calculator' },
	{ value: 11, label: 'Логическое значение (Да / Нет)', icon: 'fa-check-circle' },
	{ value: 12, label: 'Многострочный текст', icon: 'fa-align-left' },
	{ value: 4, label: 'Дата и время', icon: 'fa-clock' },
	{ value: 10, label: 'Файл (строка)', icon: 'fa-file' },
]
*/
