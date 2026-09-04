/**
 * 桌面悬浮框渲染入口（独立窗口，只读项目列表）。
 * 轻量：不注册全部 Element Plus 图标，只引入用到的组件。
 */
import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import TrayBox from '../features/TrayBox.vue';

const app = createApp(TrayBox);
app.use(ElementPlus, { locale: zhCn });
app.mount('#traybox');
