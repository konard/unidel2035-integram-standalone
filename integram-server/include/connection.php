<?php
$connection = mysqli_connect("127.0.0.1", "integram", "integram123", "integram", 3307) or die("Couldn't connect.");
$connection->set_charset("utf8mb4");

global $mail_config;
$mail_config['smtp_username'] = 'abc@tryjob.ru'; //$replyto;  // Default reply address
$mail_config['smtp_port'] = '465'; // Порт работы.
$mail_config['smtp_host'] =  'ssl://smtp.yandex.ru';  //сервер для отправки почты
$mail_config['smtp_password'] = 'CoffeeClick';  //Измените пароль
$mail_config['smtp_debug'] = true;  //Если Вы хотите видеть сообщения ошибок, укажите true вместо false
$mail_config['smtp_charset'] = 'utf-8';	//кодировка сообщений. (windows-1251 или utf-8, итд)
$mail_config['smtp_from'] = 'Integram'; // "From" by default
define("ADMINEMAIL", "alexey.p.semenov@gmail.com");
define("TEMPLATES", ":en:ru:fu:mo:fm:");
define("ADMINHASH", sha1($_SERVER["SERVER_NAME"].$z."DronedocIntegram2025"));
define("SALT", 'DronedocSalt2025');
define("SMS_SADR", "CoffeeClick");
define("SMS_OP", "http://gateway.api.sc/get/?user=bkintru&pwd=xxx");
define("Y_CLIENT_ID", "");
define("Y_CLIENT_PK", "");

//Exec_sql("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION'", "Set sql_mode");

?>
