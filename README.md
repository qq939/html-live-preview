# HTML Live Preview

一个运行在 8082 端口的 HTML 实时预览 Web 应用。

## 功能

- **左上**：代码编辑器
  - 顶部常用 HTML 代码段快捷按钮
  - 缩写 + 回车展开（Emmet-lite 风格）：`html`、`div.btn`、`div#main`、`a[href=#]`、`ul>li*3`、`section>div.row>ul>li*2`、`div+span`
  - Tab 插入两个空格
- **左下**：文件管理器（可折叠，可拖动）
  - 保存当前编辑器内容到 localStorage
  - 列表显示文件名 + 更新时间 + 字符数
  - 支持打开、改名、删除
- **右上**：Console（iframe 脚本的输出）
  - 通过 `postMessage` 桥接 `console.log/info/warn/error/debug`、`window.error`、`unhandledrejection`
  - 每 X 秒渲染一次
- **右下**：预览 iframe（可折叠，可拖动）
  - 每 X 秒重新渲染一次
  - 顶部「立即渲染」按钮可立刻触发

## 拖动分隔线

- 垂直分隔条：拖动可调整左右两列宽度
- 水平分隔条 ×2：分别在左列和右列内调整上下两宫格高度
- 比例持久化到 localStorage
- 顶部「重置布局」按钮恢复默认比例

## 渲染间隔

- 右上角「渲染间隔 N 秒」显示当前值
- 鼠标滚轮调节（1–1000，默认 10）
- 点击可手动输入数值

## 启动

```bash
node server.js
```

服务监听 `http://0.0.0.0:8082`，浏览器打开 `http://localhost:8082/`。

## 文件结构

```
server.js              # Node HTTP 服务
public/index.html      # 页面
public/style.css       # 样式
public/app.js          # 全部交互逻辑（编辑器、预览、console、文件管理、可拖动布局）
```