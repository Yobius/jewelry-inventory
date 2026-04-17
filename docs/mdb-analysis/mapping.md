# MDB → Prisma mapping

Source: `StoreOff Jew XP-3.22.mdb` (Microsoft Jet 4.0, ~37 MB, 91 таблиці).

Повний дамп схеми та семплів у [`packages/db/docs/mdb-analysis/tables.json`](../../packages/db/docs/mdb-analysis/tables.json).

## Ключові таблиці

| Таблиця | Рядків | Роль |
|---|---:|---|
| `Products` | 38 042 | **Каталог шаблонів** (артикул + стандартна назва + стандартні ціни) |
| `Movements` | 11 288 | **Окремі одиниці складу** (вага, ціна, дати, архів/продано) |
| `Supplyer` | 202 | Постачальники |
| `TypeOfProduct` | 21 | Тип = Метал + Проба разом (напр. "Золото 585°") |
| `Category` | 19 | Категорія ("Каблучка", "Перстень" …) |
| `Probe` | 11 | Проби (999.9, 925, 585 …) |
| `Sizes` | 78 | Розміри |
| `Clients` | 6 | Клієнти / торгові точки |
| `BarCodeHandle` | 3 | Обробники штрих-кодів |
| `DiamondChars` | 3 | Характеристики каменів (майже порожньо) |
| `Birks` | 10 | Формати бірок (25×35, 25×40Лого …) |
| `InventINFO` | 38 | Історія інвентаризацій |
| `Firms` | 0 | Банківські реквізити (пусто, пропускаємо) |
| `SaleMans` | 0 | Продавці (пусто) |

## Архітектурна відмінність

MDB має **дві сутності**: `Products` (шаблон артикула) і `Movements` (фізична одиниця на складі зі своєю вагою/історією). Наша поточна схема має тільки `Item` — одну сутність з фіксованою вагою.

**Рішення для імпорту:** кожен `Movements`-рядок стає одним нашим `Item`, а `Products` підтягуємо як довідник для назви/дефолт-цін. `Arch=true` або `DateSold is not null` → пропускаємо (це проданий/списаний товар, не імпортуємо в склад, але можемо зберегти як `Transaction` історії — на наступному кроці).

## Мапінг полів

### `Products` (шаблон) — використовуємо як довідник

```
Products.ArtNum         → Item.sku (якщо унікальний; інакше + "-" + Movements.RecordID)
Products.ProductName    → Item.name
Products.Price          → Item.pricing.unitPrice (default, якщо Movements.OutPrice=0)
Products.PerGramm       → Item.pricing.perGram
Products.Category       → Item.specs.tags[] += Category.CategoryName
Products.Group          → Item.manufacturerId (після імпорту Firms/груп; поки null)
```

### `Movements` (фізична одиниця) — основна таблиця імпорту

```
Movements.RecordID       → Item.identification.legacyRecordId
Movements.ID             → Item.identification.legacyId (штрих-код старого)
Movements.ProductID      → FK на Products для збагачення name/sku
Movements.TypeOfProduct  → (lookup у TypeOfProduct) → material + carat
Movements.Weight         → Item.weight
Movements.OutPrice       → Item.pricing.unitPrice (пріоритет над Products.Price)
Movements.InPrice        → Item.pricing.perGram (якщо > 0)
Movements.ClientID       → Inventory.quantities.{warehouse|point1|...} (визначається за ID; client=3 →warehouse)
Movements.DateIncome     → Item.createdAt (для аудиту)
Movements.DocNum         → Item.specs.tags[] += "DOC:" + DocNum
Movements.StonesINFO     → розбираємо текст → створюємо ItemStone записи
Movements.Comments       → Item.specs.notes
Movements.DeliveryID     → Import.id (групуємо по поставці)
Movements.Arch           → пропуск (архівний)
Movements.DateSold NOT NULL → пропуск (проданий)
```

### `Supplyer` → `Supplier` ✅

```
Supplyer.SupplName       → Supplier.name
Supplyer.EDRPOU          → Supplier.notes (EDRPOU: XXX)
Supplyer.Address         → Supplier.notes (+ Address)
Supplyer.LicenseNum      → Supplier.notes (+ License)
Supplyer.IsImport        → Supplier.notes (+ Import flag)
```

### `TypeOfProduct` → Material + carat lookup

```
"Золото 585°"   → material=GOLD,    carat=585
"Золото 750°"   → material=GOLD,    carat=750
"Срібло 925°"   → material=SILVER,  carat=925
IsGold=true     → GOLD
IsSilver=true   → SILVER
Probe           → carat (int)
(інші з Probe≈0) → OTHER
```

### `Category` → `Item.specs.tags` (масив тегів)

Cтворюємо масив `tags`: `["ring"]` для "Каблучка", `["signet"]` для "Печатка" тощо. Список коротких транслітерацій зашиваємо в мапі.

### `Clients` → локації складу (фактичні дані)

MDB тримає залишки "за клієнтом" (= точкою). Після перевірки реального розподілу серед активних 10 006 Movements:

| ClientID | Назва | Активних одиниць | Наша локація |
|---:|---|---:|---|
| 3 | Золото-Слобожа. (IsShop=true) | 2 833 | `point1` |
| 4 | Склад | 23 | `warehouse` |
| 5 | Донец (IsShop=true) | 4 085 | `point2` |
| 7 | Серебро-Слобожа. (IsShop=true) | 3 014 | `point3` |
| 1 | Поставщик | 50 | `warehouse` (об'єднуємо з ID=4) |
| 0 | (без клієнта) | 1 | `warehouse` |
| 2 | Разовая продажа | 0 активних | пропустити (каса) |

**Підсумкові залишки:**
- `warehouse`: 74
- `point1` (Золото-Слобожа): 2 833
- `point2` (Донец): 4 085
- `point3` (Серебро-Слобожа): 3 014

### `TypeOfProduct` — виявлені нюанси

- **Дублікати**: ID=20 та ID=21 обидва "Серебро 925°" (різні `IsWgh`).
- **Нежувелірні типи**: "Камні", "Футляри", "Сувенири", "Чистяче", "Картина", "Шнурок кожа" — carat=null, material=OTHER.
- **OTHER з carat=925**: ID=19 "Позолота", ID=24 "Обр.Серебро" — це старі помилки, імпортуємо як є.
- **"Годиник" (ID=70)**: material=OTHER (годинники не мають проби).

Повний mapping лежить у коді в `scripts/migrate-from-mdb.ts`.

### Пропускаємо повністю

- `Firms` (порожня)
- `SaleMans` (порожня)
- `DiamondChars` (майже порожня)
- `*1` таблиці (реплікаційні бекапи, ідентичні головним)

## План імпорту (наступний turn)

1. **dry-run**: `pnpm tsx packages/db/scripts/migrate-from-mdb.ts <path> --dry-run`
   Виводить статистику без запису в БД
2. **seed довідників**: `--step=suppliers` (Supplyer → Supplier)
3. **seed товарів**: `--step=items` (Products + Movements → Item + Inventory)
4. **перевірка**: count у Neon vs. MDB
5. **за потреби — історія**: `--step=transactions` (проданий/повернений Movements → Transaction)

## Ризики

- **SKU конфлікти**: в `Products` поле `ArtNum` може бути не унікальним (38k рядків, тільки 20 символів). Треба перевірити unique count перед імпортом.
- **StonesINFO** — вільний текст, потрібен regex-парсер. Для v1 кладемо весь текст в `ItemStone.notes`, камені з `Stone` таблиці створюємо тільки якщо впізнаємо.
- **Кодування**: MDB використовує Windows-1251. `mdb-reader` декодує автоматично (бачимо кирилицю коректно: "Каблучка", "Печатка", "Юмекс", "Золотий стрілець").
- **Дати**: є записи 1998, 2010, 2025 — виглядає ок, не треба фіксити.
