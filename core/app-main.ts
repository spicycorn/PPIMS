import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import App from './App.vue';
import './style.css';

// 按需导入图标（只注册应用实际用到的，避免全量注册几百个的启动开销）
import {
  Back,
  Bottom,
  Briefcase,
  Close,
  Collection,
  Delete,
  Download,
  Edit,
  Files,
  Folder,
  FolderOpened,
  Key,
  Link,
  List,
  Loading,
  Open,
  Operation,
  Plus,
  Pointer,
  Position,
  Refresh,
  Remove,
  Search,
  Select,
  Sort,
  Top,
  Upload,
  User,
  Warning,
} from '@element-plus/icons-vue';

const app = createApp(App);

// 全局注册用到的 Element Plus 图标
const icons = {
  Back,
  Bottom,
  Briefcase,
  Close,
  Collection,
  Delete,
  Download,
  Edit,
  Files,
  Folder,
  FolderOpened,
  Key,
  Link,
  List,
  Loading,
  Open,
  Operation,
  Plus,
  Pointer,
  Position,
  Refresh,
  Remove,
  Search,
  Select,
  Sort,
  Top,
  Upload,
  User,
  Warning,
};
for (const [name, comp] of Object.entries(icons)) {
  app.component(name, comp);
}

app.use(createPinia());
app.use(ElementPlus, { locale: zhCn });
app.mount('#app');
