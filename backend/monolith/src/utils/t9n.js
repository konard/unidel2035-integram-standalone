// t9n() — i18n for error messages (PHP parity: index.php lines 560–572)
//
// Two modes:
//   1. Dictionary mode:  t9n('invalid_database', 'RU') → 'Неверная база данных'
//   2. Inline mode (PHP compat):  t9n('[RU]Текст[EN]Text', 'EN') → 'Text'
//
// If key is not found in dictionary and doesn't contain inline markers,
// the key itself is returned as-is.

const dictionary = {
  // --- Authentication & authorization ---
  invalid_database:           { RU: 'Неверная база данных',             EN: 'Invalid database' },
  invalid_database_name:      { RU: 'Неверное имя базы данных',         EN: 'Invalid database name' },
  database_not_found:         { RU: 'База данных не найдена',           EN: 'Database not found' },
  not_logged:                 { RU: 'Не авторизован',                   EN: 'not logged' },
  auth_required:              { RU: 'Требуется авторизация',            EN: 'Authentication required' },
  auth_failed:                { RU: 'Ошибка авторизации',               EN: 'Authentication failed' },
  invalid_token:              { RU: 'Неверный или просроченный токен',   EN: 'Invalid or expired token' },
  invalid_csrf:               { RU: 'Неверный или просроченный CSRF токен', EN: 'Invalid or expired CSRF token' },
  invalid_secret:             { RU: 'Неверный секретный токен',         EN: 'Invalid secret token' },
  login_required:             { RU: 'Необходимо войти в систему',       EN: 'Login required' },
  login_password_required:    { RU: 'Необходимо указать логин и пароль', EN: 'Login and password required' },
  invalid_credentials:        { RU: 'Неверные учетные данные',          EN: 'Invalid credentials' },
  unauthorized:               { RU: 'Нет доступа',                     EN: 'Unauthorized' },
  insufficient_privileges:    { RU: 'Недостаточно прав',                EN: 'Insufficient privileges' },
  grant_check_failed:         { RU: 'Проверка прав доступа не пройдена', EN: 'Grant check failed' },

  // --- Validation ---
  invalid_email:              { RU: 'Вы ввели неверный email',          EN: 'Please provide a valid email' },
  empty_password:             { RU: 'Введен пустой пароль',             EN: 'Please input the password' },
  password_too_short:         { RU: 'Пароль должен быть не менее 6 символов', EN: 'Password must be at least 6 characters' },
  passwords_mismatch:         { RU: 'Введенные вами пароли не совпадают', EN: 'Passwords do not match' },
  accept_terms:               { RU: 'Пожалуйста, примите условия соглашения', EN: 'Please accept the terms' },
  email_registered:           { RU: 'Этот email уже зарегистрирован.',  EN: 'This email is already registered.' },
  invalid_data:               { RU: 'Неверные данные',                  EN: 'invalid data' },
  invalid_user:               { RU: 'Неверный пользователь',            EN: 'invalid user' },
  user_not_found:             { RU: 'Пользователь не найден',           EN: 'user not found' },

  // --- Objects ---
  object_not_found:           { RU: 'Объект не найден',                 EN: 'Object not found' },
  cannot_modify_meta:         { RU: 'Нельзя изменить объект метаданных', EN: 'Cannot modify metadata object' },
  cannot_move_meta:           { RU: 'Нельзя переместить объект метаданных', EN: 'Cannot move metadata object' },
  cannot_delete_self:         { RU: 'Вы не можете удалить себя',        EN: 'You cannot delete yourself' },
  no_attributes:              { RU: 'Атрибуты не указаны',              EN: 'No attributes provided' },
  parent_not_found:           { RU: 'Родительский объект не найден',    EN: 'Parent not found' },
  parent_id_zero:             { RU: 'ID родителя не может быть 0',      EN: 'Parent ID cannot be 0' },
  type_required:              { RU: 'Тип (t или type) обязателен',      EN: 'Type ID (t or type) is required' },
  type_not_found:             { RU: 'Тип не найден',                    EN: 'Type not found' },
  type_name_required:         { RU: 'Имя типа (val) обязательно',       EN: 'Type name (val) is required' },
  base_type_not_set:          { RU: 'Базовый тип не задан',             EN: 'Base type is not set' },
  no_fields_to_update:        { RU: 'Нет полей для обновления',         EN: 'No fields to update' },
  rename_admin_forbidden:     { RU: 'Создайте другого пользователя вместо переименования администратора', EN: 'Please create another user instead of renaming the admin' },
  reference_not_found:        { RU: 'Ссылка не найдена',                EN: 'Reference not found' },
  insufficient_target:        { RU: 'Недостаточно прав для целевого родителя', EN: 'Insufficient privileges for target parent' },
  insufficient_type_mod:      { RU: 'Недостаточно прав для изменения типов', EN: 'Insufficient privileges for type modification' },

  // --- Files ---
  wrong_extension:            { RU: 'Недопустимый тип файла!',          EN: 'Wrong file extension!' },
  cannot_delete_file:         { RU: 'Не удалось удалить файл',          EN: 'Cannot delete the file' },
  cannot_open_file:           { RU: 'Не удается открыть файл',          EN: 'Cannot open file' },

  // --- Reports ---
  empty_report:               { RU: 'Пустой отчет',                    EN: 'Empty report' },
  report_link_failed:         { RU: 'Не могу связать колонки отчета.',  EN: 'Failed to link the columns of the report.' },

  // --- General ---
  server_error:               { RU: 'Ошибка сервера',                  EN: 'server error' },
  connection_failed:          { RU: 'Не удалось подключиться',          EN: 'Connection failed' },
  reset_failed:               { RU: 'Сброс не удался',                 EN: 'Reset failed' },
  wrong_date:                 { RU: 'Неверная дата',                    EN: 'Wrong date' },
  invalid_format:             { RU: 'Неверный формат или нечисловые ID', EN: 'Invalid format or non-numeric IDs' },
  google_oauth_not_configured: { RU: 'Google OAuth не настроен на этом сервере', EN: 'Google OAuth is not configured on this server' },
  google_auth_failed:         { RU: 'Ошибка аутентификации Google',     EN: 'Google authentication failed' },
  auth_error:                 { RU: 'Ошибка аутентификации',            EN: 'Authentication error' },
  user_registry_unavailable:  { RU: 'Реестр пользователей недоступен',  EN: 'User registry not available' },
  missing_auth_code:          { RU: 'Отсутствует код авторизации',      EN: 'Missing authorization code' },
  registration_failed:        { RU: 'Ошибка регистрации',               EN: 'Registration failed' },
};

/**
 * Translate a message key or inline-formatted string.
 *
 * PHP-compatible inline format: "[RU]Текст[EN]Text"
 * Dictionary mode:              t9n('invalid_database', 'RU')
 *
 * @param {string} key  - dictionary key OR inline-formatted string
 * @param {string} lang - locale code: 'RU', 'EN', etc. (default 'EN')
 * @returns {string} translated message
 */
export function t9n(key, lang = 'EN') {
  if (!key) return '';

  const locale = (lang || 'EN').toUpperCase();

  // --- Inline mode (PHP compat): "[RU]Текст[EN]Text" ---
  if (key.includes('[') && /\[[A-Z]{2}\]/.test(key)) {
    const marker = `[${locale}]`;
    const idx = key.indexOf(marker);
    if (idx === -1) return key;
    const rest = key.slice(idx + marker.length);
    const match = rest.match(/^([\s\S]*?)(?:\[[A-Z]{2}\]|$)/);
    return match ? match[1] : rest;
  }

  // --- Dictionary mode ---
  const entry = dictionary[key];
  if (!entry) return key;
  return entry[locale] || entry.EN || key;
}

/**
 * Helper: extract locale from Express request (mirrors PHP $locale logic).
 * Checks cookie <db>_locale, then my_locale, defaults to 'RU'.
 *
 * @param {object} req - Express request
 * @param {string} db  - database name
 * @returns {string} 'RU' | 'EN' | ...
 */
export function getLocale(req, db) {
  return req.cookies?.[(db || '') + '_locale']
    || req.cookies?.my_locale
    || 'RU';
}

export default t9n;
