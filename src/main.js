import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import i18n from './i18n'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'

// Import PrimeVue components
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Card from 'primevue/card'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import Dialog from 'primevue/dialog'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Avatar from 'primevue/avatar'
import Badge from 'primevue/badge'
import OverlayPanel from 'primevue/overlaypanel'
import Popover from 'primevue/popover'
import Sidebar from 'primevue/sidebar'
import Divider from 'primevue/divider'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import Breadcrumb from 'primevue/breadcrumb'
import Tooltip from 'primevue/tooltip'
import StyleClass from 'primevue/styleclass'

// Import styles
// PrimeVue 4+ uses built-in theme system via @primevue/themes/aura (imported above)
// No need to import theme CSS manually
import 'primeicons/primeicons.css'
import '@fortawesome/fontawesome-free/css/all.css'
import '@/assets/layout/layout.scss'
import '@/assets/layout/_topbar_override.scss'

// Import App component
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

// Use plugins
app.use(pinia)
app.use(router)
app.use(i18n)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.dark-mode'
    }
  }
})
app.use(ToastService)
app.use(ConfirmationService)

// Register global components
app.component('Button', Button)
app.component('InputText', InputText)
app.component('Password', Password)
app.component('Card', Card)
app.component('Toast', Toast)
app.component('ConfirmDialog', ConfirmDialog)
app.component('Dialog', Dialog)
app.component('DataTable', DataTable)
app.component('Column', Column)
app.component('TabView', TabView)
app.component('TabPanel', TabPanel)
app.component('Select', Select)
app.component('Dropdown', Select)
app.component('SelectButton', SelectButton)
app.component('Avatar', Avatar)
app.component('Badge', Badge)
app.component('OverlayPanel', OverlayPanel)
app.component('Popover', Popover)
app.component('Sidebar', Sidebar)
app.component('Divider', Divider)
app.component('Checkbox', Checkbox)
app.component('Message', Message)
app.component('Breadcrumb', Breadcrumb)
app.directive('tooltip', Tooltip)
app.directive('styleclass', StyleClass)

app.mount('#app')
