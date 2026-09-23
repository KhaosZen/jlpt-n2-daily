# 日本語 Daily Practice

纯 HTML、CSS、JavaScript 的每日 JLPT N2 语法练习网站。每天约 5–10 分钟，重点训练助词和基础语法。无账号、后端、数据库或前端构建步骤。

## 功能

- 按 **Asia/Shanghai** 时区判断“今天”，优先加载当天练习；尚未发布时明确提示并显示最近一篇已发布内容。
- 支持选择、填空、改写三种题型。答案默认折叠，展开后显示答案、解释和纠错。
- 每道题的回答、正误及知识点答题次数/错误次数保存在当前浏览器 `localStorage`。全部题目记录后可标记当日完成，历史列表显示完成状态。
- 清除学习记录需要浏览器二次确认。支持手机布局、键盘操作、浅色/深色模式。
- 日文汉字可在 JSON 中写成 `会社{かいしゃ}`，页面会生成 ruby 注音。只在日文内容里使用这个标记。

学习记录不会跨设备同步。清理浏览器数据会删除进度。第一阶段不会自动生成练习或推送提醒。

## 项目结构

```text
index.html                页面结构
styles.css                响应式和深色模式样式
app.js                    加载、题型、答题和本地进度
data/index.json           已发布日期索引
data/YYYY-MM-DD.json      每天一份练习
scripts/validate-data.js  无依赖的 JSON 校验脚本
scripts/serve.js           本地静态预览服务器
.github/workflows/validate.yml  提交时校验并部署 Pages
```

示例数据为 2026-09-21 至 2026-09-25，其中 23–25 日分别练习「はず・つもり」「と・たら」「しか～ない・だけ・は」。

## 本地预览与检查

在仓库根目录运行：

```bash
node scripts/validate-data.js
node scripts/serve.js
```

打开 `http://127.0.0.1:8000/`；也可以打开 `http://127.0.0.1:8000/jlpt-n2-daily/` 测试 GitHub Pages 子路径。直接以 `file://` 打开时，浏览器通常不允许页面读取 JSON。

可在浏览器控制台执行 `localStorage.getItem('n2-progress-v2')` 查看保存的数据。清除记录入口在左侧导航底部。

## 新增每日内容

1. 复制 `data/2026-09-25.json` 为目标日期文件，修改 `date`、主题、讲解、例句、题目与解析。
2. 在 `data/index.json` 的 `lessons` 中加入 `{ "date": "YYYY-MM-DD", "title": "主题" }`。标题需与日期文件一致。
3. 运行 `node scripts/validate-data.js`，检查通过后提交并推送。

JSON 顶层字段：

| 字段 | 含义 |
| --- | --- |
| `schema_version` | 当前为 `1` |
| `date`, `title`, `duration_minutes` | 日期、主题、预计分钟数 |
| `summary`, `explanation` | 简介与短讲解 |
| `grammar_points` | 含稳定 `id`、`name`、`explanation` 的知识点 |
| `review_points` | 本期复习的知识点 ID，必须也出现在 `grammar_points` |
| `examples` | 日文 `jp` 与中文 `zh` |
| `exercises` | 题目数组，每题有唯一 `id`、`type`、`grammar_points`、`prompt`、`answer`、`explanation`、`correction` |

题型字段：

| `type` | 额外字段 | 答案格式 |
| --- | --- | --- |
| `multiple_choice` | `jp`, `options` | `answer` 为从 0 开始的选项序号 |
| `fill_blank` | `jp`, `accepted_answers` | `answer` 为标准填词；允许的写法放在数组中 |
| `rewrite` | `source`, `accepted_answers` | `answer` 为标准改写句；允许的写法放在数组中 |

`explanation` 说明正确表达的语感；`correction` 说明错误项为何错误或不自然。复习旧知识点时在本期 `grammar_points` 添加相同的稳定 ID，再在 `review_points` 标出，并给相应题目标记该 ID。日文注音用 `漢字{かんじ}`，例如 `駅{えき}に着{つ}く`。

进度结构版本为 `2`，包含 `completedDates`、按日期和题目 ID 组织的 `attempts`，以及按知识点 ID 组织的 `grammarStats`（`attempts` 和 `errors`）。本地记录用于未来的错题统计；GitHub Actions 无法读取访问者浏览器里的数据。

## 创建仓库并部署 GitHub Pages

1. 在 GitHub 新建公开仓库，例如 `jlpt-n2-daily`，无需额外生成 README。
2. 若当前目录尚未初始化 Git，在此运行 `git init -b main`。然后提交与推送：

   ```bash
   git add .
   git commit -m "Build daily N2 practice MVP"
   git remote add origin https://github.com/<用户名>/<仓库名>.git
   git push -u origin main
   ```

   若已存在 Git 仓库和 `origin`，保留现有远端，直接提交和推送即可。
3. 在仓库 **Settings → Pages → Build and deployment**，将 **Source** 设为 **GitHub Actions**。推送到 `main` 后，`validate.yml` 先验证 JSON，再使用 GitHub 官方 Pages actions 部署。Pull request 只校验，不部署。
4. 在 **Actions** 查看 `Validate and deploy Pages` 是否成功；Pages 设置页会显示实际地址。项目站点通常为 `https://<用户名>.github.io/<仓库名>/`。

页面与 JSON 均使用 `./` 相对路径，兼容上述仓库子路径。若仓库之前使用 **Deploy from a branch**，请切换为 **GitHub Actions**，以便使用本工作流。参考 [GitHub 官方 Pages 工作流指南](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## Future Architecture

第二阶段可建立单独的定时 GitHub Actions 工作流：

```text
GitHub Actions 定时触发
  → 读取可供工作流访问的学习薄弱点数据
  → 调用 LLM API
  → 生成 data/YYYY-MM-DD.json 并更新 data/index.json
  → validate-data.js 校验
  → 提交新内容
  → 在同一次工作流中部署 GitHub Pages
```

目前的薄弱点只存于本地浏览器，工作流不能直接读取。第二阶段需先确定个人进度如何安全、主动地导出到工作流可访问的位置；不应假设网站自动同步。生成脚本要检查日文、注音、答案和纠错内容，建议先走人工审核。

LLM API Key 只能放入 **GitHub Actions Secrets**，不能进入 HTML、JavaScript、JSON 或 Git 仓库。由 `GITHUB_TOKEN` 创建的提交通常不会再触发另一轮 Pages 发布，因此生成与部署需在同一次工作流中完成；参见 [GitHub Pages 发布来源说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

职责分工：**GitHub Pages** 承载练习；**GitHub Actions** 发布每日内容；**ChatGPT Scheduled Task** 每天 19:00 提醒“今日の日本語練習が用意できました。”，未来可附上站点地址。网站本身不发送提醒。
