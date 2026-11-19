# Установка dsh-pet-cactus

## Что нужно

| Требование | Значение |
|---|---|
| DSH | 0.2.2-rc.3 (проверено); ниже — не тестировалось |
| Интерфейс | Web-GUI (`dsh web` или приложение) |
| Профиль | тот, который реально запускается: у приложения это `desktop` |
| Node | ≥ 22 (у плагина нет зависимостей, версия нужна харнессу) |

Плагин не требует сети, Electron, модели и прав администратора.

## Вариант 1: из npm

Пакет: [dsh-pet-cactus](https://www.npmjs.com/package/dsh-pet-cactus) (0.1.5).

```sh
dsh plugin --profile desktop add dsh-pet-cactus
```

Проверить, что запись появилась:

```sh
# package.json профиля
# dependencies["dsh-pet-cactus"], dsh.profile.bundles содержит "dsh-pet-cactus"
```

Затем **полностью закрыть и открыть DSH**. Обновление вкладки не активирует
host-половину: маршруты и подписка на события регистрируются при старте процесса.

## Вариант 2: из папки (разработка)

Плагин можно подключить ссылкой, не публикуя. Рабочий способ — менеджер плагинов
DSH: он сам вызывает pnpm и умеет `link:`-спецификацию.

Если у вас есть доступ к инструменту `plugin_manager` (в сессии агента DSH):

```
plugin_manager install_bundle target="link:<путь-к-плагину>"
```

Ответ со `"application": "applied"` означает, что зависимость добавлена в профиль
и строка бандла включена. Host-половина начнёт работать сразу, браузерная —
после перезагрузки страницы.

Вручную (если менеджер недоступен):

1. Сделать бэкап профиля:

   ```powershell
   $p = "$env:USERPROFILE\.dsh\profiles\desktop"
   Copy-Item "$p\package.json" "$p\package.json.bak"
   ```

2. Добавить в `package.json` профиля:

   ```jsonc
   {
     "dependencies": {
       "dsh-pet-cactus": "link:D:/deepseek-harness/dsh-pet-cactus"
     },
     "dsh": {
       "profile": {
         "bundles": [ /* ... */, "dsh-pet-cactus" ]
       }
     }
   }
   ```

3. Сделать имя разрешимым из профиля — символическая ссылка (junction на Windows):

   ```powershell
   New-Item -ItemType Junction `
     -Path "$p\node_modules\dsh-pet-cactus" `
     -Target "<путь-к-плагину>"
   ```

4. Проверить разрешение имени до перезапуска:

   ```powershell
   Set-Location $p
   node -e "import('dsh-pet-cactus').then(m => console.log(Object.keys(m)))"
   # ['apply', 'createHost', 'inject', 'isSubagentSession', 'name']
   ```

5. Перезапустить DSH.

Если `dsh plugin add` ругается «profile desktop is managed exclusively by the
Electron application», используйте вариант 2 либо установку через менеджер плагинов
приложения.

## Вариант 3: overlay без установки (из исходников)

В репозитории есть `dev/cordis.local.yml` — патч-слой, который подключает плагин
по абсолютному пути, не трогая профиль:

```sh
dsh --profile <свой-профиль> --patch <путь-к-плагину>/dev/cordis.local.yml
```

Профиль `desktop` так не запустить: CLI отказывается («managed exclusively by the
Electron application») — для него остаётся вариант 2. Проверить сам слой без запуска
приложения можно на любом другом профиле:

```sh
dsh --profile <свой-профиль> --patch <путь-к-overlay> --dump-config
```

В `name` overlay указан абсолютный путь к `lib/index.js` — DSH грузит плагин прямо
из папки.

## Приёмка

| Шаг | Ожидание |
|---|---|
| `GET /dsh-pet-cactus/health` | `200`, `ok: true`, `version` |
| `GET /dsh-pet-cactus/api/config` | JSON с `config` и `path` |
| В окне DSH | кактус в правом нижнем углу |
| Клик | пузырь с репликой |
| Правый клик | ничего: меню убрано, системное меню подавлено |
| Перетаскивание | кактус следует за курсором, позиция сохраняется |
| Работа агента | на `tool/call` меняется настроение и текст |

Порт брать из строки запуска DSH (например, `http://127.0.0.1:52672`).

## Если не появился

1. **Хост не отвечает** — значит, плагин не загрузился или DSH не перезапускался.
   Смотреть лог DSH: строка `dsh-pet-cactus: маршруты на /dsh-pet-cactus`.
2. **Хост отвечает, кактуса нет** — не загрузилась браузерная половина.
   Открыть DevTools → Console: `[dsh-pet-cactus]` предупреждения.
   Частые причины: `slots` недоступен (старая версия DSH), `react` не пришёл.
3. **Кактус есть, но не реагирует** — проверить `reactToAgent` в конфиге и что
   событие не от суб-агента.
4. **Пузырь за краем** — перетащить кактуса от края; позиция обновится.

## Откат

```sh
dsh plugin --profile desktop remove dsh-pet-cactus
```

Затем перезапуск. Данные лежат отдельно и не удаляются:

```powershell
Remove-Item -Recurse "$env:USERPROFILE\.dsh\dsh-pet-cactus"
```

При ручной установке достаточно убрать строку из `dependencies`, убрать
`dsh-pet-cactus` из `bundles` и удалить junction из `node_modules`.

## Обновление

```sh
dsh plugin --profile desktop add dsh-pet-cactus@latest
```

Перезапуск обязателен: host-половина грузится один раз. Конфиг переживает
обновление — он лежит в `~/.dsh/dsh-pet-cactus/main-config.json`, а не в пакете.
