# Integram Landing Components

Набор минималистичных компонентов для посадочной страницы Integram с поддержкой темной темы и адаптивного дизайна.

## Компоненты

### IntegramHero

Минималистичный hero section с заголовком платформы, описанием и CTA кнопкой.

**Props:**
- `title` (String) - Заголовок платформы (по умолчанию: "Integram")
- `subtitle` (String) - Краткое описание (по умолчанию: "Универсальная система управления данными")
- `database` (String) - Название базы данных для отображения в тэге
- `userName` (String) - Имя пользователя для отображения в тэге
- `showCta` (Boolean) - Показать CTA кнопку (по умолчанию: false)
- `ctaLabel` (String) - Текст CTA кнопки (по умолчанию: "Начать работу")

**Events:**
- `@cta-click` - Событие при клике на CTA кнопку

**Пример использования:**
```vue
<IntegramHero
  title="Добро пожаловать в Integram"
  subtitle="Универсальная система управления данными"
  :database="database"
  :userName="userName"
  :show-cta="true"
  cta-label="Начать работу"
  @cta-click="handleCtaClick"
/>
```

### IntegramFeatures

Компонент для отображения основных возможностей системы.

**Props:**
- `title` (String) - Заголовок секции (опционально)
- `subtitle` (String) - Подзаголовок секции (опционально)
- `features` (Array) - Массив объектов с возможностями. Каждый объект должен содержать:
  - `icon` (String) - Класс иконки PrimeIcons
  - `title` (String) - Название возможности
  - `description` (String) - Описание возможности

**Пример использования:**
```vue
<IntegramFeatures
  title="Возможности системы"
  subtitle="Полный набор инструментов для работы с данными"
  :features="[
    {
      icon: 'pi pi-shield',
      title: 'Безопасность',
      description: 'Система прав доступа и защита данных'
    },
    {
      icon: 'pi pi-bolt',
      title: 'Удобство',
      description: 'Интуитивный интерфейс для работы с данными'
    }
  ]"
/>
```

### IntegramFooter

Футер с копирайтом, ссылками на документацию и контактами.

**Props:**
- `copyrightText` (String) - Текст копирайта (по умолчанию: "Integram. Все права защищены.")
- `copyrightYear` (String|Number) - Год копирайта (по умолчанию: текущий год)
- `links` (Array) - Массив объектов со ссылками. Каждый объект должен содержать:
  - `label` (String) - Текст ссылки
  - `url` (String) - URL ссылки
  - `icon` (String) - Класс иконки PrimeIcons (опционально)
  - `external` (Boolean) - Внешняя ссылка (по умолчанию: false)
- `additionalInfo` (String) - Дополнительная информация (опционально)

**Events:**
- `@link-click` - Событие при клике на ссылку (для внутренних ссылок с #)

**Пример использования:**
```vue
<IntegramFooter
  copyright-text="Integram. Все права защищены."
  :links="[
    {
      label: 'Документация',
      url: '/docs',
      icon: 'pi pi-book',
      external: false
    },
    {
      label: 'API',
      url: '/api',
      icon: 'pi pi-code',
      external: false
    }
  ]"
  @link-click="handleFooterLinkClick"
/>
```

## Особенности

### Минималистичный дизайн
Все компоненты разработаны с учетом принципов минимализма, используя чистые линии и достаточное количество пространства.

### Поддержка PrimeVue
Компоненты полностью интегрированы с PrimeVue и используют его дизайн-систему:
- Используются PrimeVue компоненты (Card, Tag, Button)
- Используются PrimeVue CSS переменные для цветов и размеров
- Используются PrimeIcons для иконок

### Поддержка темной темы
Все компоненты автоматически поддерживают темную тему через CSS переменные PrimeVue:
- `--p-primary-color` - основной цвет
- `--p-text-color` - цвет текста
- `--p-text-muted-color` - цвет второстепенного текста
- `--p-surface-*` - цвета фона
- и другие

### Адаптивный дизайн
Компоненты адаптируются под различные размеры экранов:
- **Desktop** (> 768px) - полноразмерный вид
- **Tablet** (481-768px) - средний размер элементов
- **Mobile** (≤ 480px) - компактный вид

## Импорт

Все компоненты экспортируются через `index.js`:

```javascript
import { IntegramHero, IntegramFeatures, IntegramFooter } from '@/components/integram-landing'
```

Или по отдельности:

```javascript
import IntegramHero from '@/components/integram-landing/IntegramHero.vue'
import IntegramFeatures from '@/components/integram-landing/IntegramFeatures.vue'
import IntegramFooter from '@/components/integram-landing/IntegramFooter.vue'
```

## Стилизация

Компоненты используют scoped стили и не влияют на глобальные стили приложения. Все стили основаны на CSS переменных PrimeVue, что обеспечивает автоматическую поддержку тем.

## Анимации

Компоненты включают плавные анимации:
- `IntegramHero` - анимация появления иконки (fadeInScale)
- `IntegramFeatures` - анимация при наведении на элементы
- `IntegramFooter` - анимация при наведении на ссылки

## Доступность

Все компоненты разработаны с учетом доступности:
- Семантическая HTML разметка
- ARIA атрибуты для иконок (`aria-hidden="true"`)
- Поддержка навигации с клавиатуры
- Правильная контрастность цветов
