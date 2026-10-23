# AGENTS.md — правила для агентской разработки

## О проекте

Three.js + Jolt Physics (MT, SharedArrayBuffer) мини-игра на Vite.
`src/main.js` — точка входа, остальной код разбит на доменные модули.

## Структура кода

- Новый код добавляется в модуль соответствующего домена, не в `main.js`.
  `main.js` — только бут/лоадер/wiring, держим его ~150 строк.
- Домены: `constants.js`, `state.js`, `engine.js`, `loop.js`,
  `fx/*`, `physics/*`, `graphics/*`, `game/*`, `input/*`, `ui/*`.
- Кол-во строк на модуль -> цель 200-500, максимум ~700. Вырос — дробить.
- Все тюнеры (значения физики/FX/движения) — именованные константы в
  `constants.js`. Магические числа в телах функций запрещены, кроме
  значений, уникальных для одного вызова FX.
- Дублирующийся код (3+ похожих фрагмента) -> извлекать общий хелпер
  (пример: `fx/pool.js` `acquireEffect`, `vanishObject`, `zeroVec3`).
- `state.js` / `engine.js` внутри цикла нельзя импортировать в
  `main.js` через DI-хаки: только статические `import`.

## Памятка по Jolt (критические ловушки)

- Результаты `GetPosition()`, `GetRotation()`, `GetLinearVelocity()`,
  `GetPositionAndRotation()` могут быть **shared/переиспользуемыми
  объектами**. Читать компоненты (`GetX/GetY/GetZ`) сразу после вызова,
  до следующего Jolt-getter. Не передавать в `J.destroy()`.
- Для нулевых/временных J.Vec3 использовать только `state.zeroVec3`,
  `state.tmpVec3`, `state.tmpVec3b`. Не передавать один и тот же
  объект в два разных нечитаемых параметра `SetLinearAndAngularVelocity`
  как чтение/запись — при одинаковых значениях это ок, при разных нельзя.
- Все созданные J-описатели (`BodyCreationSettings`, `RVec3`, `Quat`
  в создании тела) обязаны освобождаться `J.destroy()`.
- Не вызывать `J.destroy()` для объектов из state (это shared-ресурсы).

## Соглашения JavaScript

- ES-модули, живые импорты. Без CommonJS.
- Комментарии в коде не добавлять (только если явно попросит пользователь
  и на английском, кратко, `// `-стайл).
- Русский текст HUD/подсказок — как есть; не переводить без запроса.
- Идентификаторы camelCase; константы SCREAMING_SNAKE_CASE.
- Никаких новых зависимостей без явного запроса пользователя.

## Контракты, которые нельзя ломать

- `window.__game = state` и `window.__gameApi = { tryGrab, throwHeld,
  dropHeld, resetWorld }` (DEV-only) — используются автотестами.
- DOM-идентификаторы HUD/туч-панели: `#loader`, `#loader-text`, `#hint`,
  `#stats`, `#removed-count`, `#removed-total`, `#game`, `#touch-controls`,
  `#move-pad`, `#move-stick`, `#touch-jump`, `#touch-reset`.
- Физический порядок фикст-степа в `loop.js::fixedUpdate` — не менять
  без отдельной задачи (влияет на детерминизм тестов).
- Слои Jolt: `LAYER_NON_MOVING=0, LAYER_MOVING=1, LAYER_PORTAL=2,
  LAYER_STUCK=3`; менять только осознанно (фильтры в `physics/jolt.js`).

## Проверка перед завершением работы

1. `npm run build` — обязана проходить без новых предупреждений.
2. Run-тесты через dev-сервер (`npm run dev`, порт 5174, `--strictPort`,
   `--host 127.0.0.1` если Vite сел на IPv6):
   - capsule-test.mjs, portal-no-suction-test.mjs, counter-test.mjs,
     tornado-test.mjs, mobile-test.mjs, preview-visual.mjs
   из `C:\Users\iokun\AppData\Local\Temp\opencode\browsertest\`.
   Все выходные блоки сверять с зелёными паттернами; позиционные цифры
   могут колебаться — проверяется инвариант, а не число.
3. preview-тест требует `npm run preview` на порту 4173.

## Git-политика

- Коммит и пуш — только по явному запросу пользователя.
  Авто-коммит неисправленного кода запрещён.
- Формат комментариев: короткое предложение на англ. в императиве,
  стиль коммитов в истории репозитория (`Make thrown gears launch
  moving tornadoes`, `Decompose main.js into domain modules`).
- Секреты/ключи никогда не коммитить.

## Известные особенности окружения

- Windows PowerShell 5.1: нет `rg`, нет алиасов curl; использовать
  `Select-String`, `Invoke-WebRequest`, `Get-NetTCPConnection`.
- `[console]` в headless Chrome — sigmoidSwiftShader артефакты, игнорить
  при прогоне тестов; а `pageerror`, `requestfailed` и HTTP>=400 —
  это ошибка.
- Vite-чанки >500 kB — известное предупреждение Jolt-вкраденного WASM,
  не пытаться чинить случайно (только если явно просили).
- Настройки Vite port strict + `--host 127.0.0.1` выполнять, если
  `Test-NetConnection` показывает слушателя только на `::1`.
