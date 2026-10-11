# Narrow Thread Actions

Плагин добавляет «Архивировать» и «Удалить» при наведении на письмо в узком списке Mailspring.
Плагин проверен в Mailspring 1.26.0 для Windows.

## Установка

Выполните команды в PowerShell:

```powershell
git clone https://github.com/badigit/mailspring-narrow-actions.git
Set-Location "mailspring-narrow-actions"
& ".\install.ps1"
```

Перезагрузите окно Mailspring через меню Developer.
Наведите указатель на письмо в узком списке.
Справа появятся «Архивировать» и «Удалить», если текущая папка разрешает эти действия.

## Если плагин не работает

Откройте `%APPDATA%\Mailspring\packages\narrow-thread-actions\status.json`.
Значение `state: active` означает, что плагин загружен.
При значении `state: failed` поле `error` содержит причину ошибки.

## Отключение

Удалите папку `%APPDATA%\Mailspring\packages\narrow-thread-actions`.
Перезагрузите окно Mailspring.

## Тесты

Выполните команду в папке исходников:

```powershell
npm test
```
