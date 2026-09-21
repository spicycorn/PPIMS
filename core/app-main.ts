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

/**
 * 先等字体就绪再挂载（v1.2.8 修复"关机重启自动启动时 UI 文字位置对不齐"）。
 *
 * 根因：开机自启时机下，系统字体（Microsoft YaHei）可能尚未度量完成，
 * 首帧布局会退到回退字体计算，其行高/升降部度量不同 → el-table 行高、列边界、
 * 文本基线错位。手动启动时机器空闲、字体已就绪，故看不到问题。
 * 在 document.fonts.ready 之后再 mount，可保证"首次布局"即用真实字体度量，
 * 从根上避免错位；字体异常时该 Promise 仍会 resolve，不会卡死。
 */
const mount = () => app.mount('#app');
if (typeof document !== 'undefined' && document.fonts?.ready) {
  void Promise.resolve(document.fonts.ready)
    .then(mount)
    .catch(mount); // 字体加载异常也不阻塞启动
} else {
  mount();
}
