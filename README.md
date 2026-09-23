# 日本語 Daily Practice

纯 HTML、CSS、JavaScript 的每日日语语法练习网站。每天约 5–10 分钟，主题从基础助词到高级表达，不限定 JLPT 等级；仍会持续复习容易混淆的基础语法。无账号、后端、数据库或前端构建步骤。

## 功能

- 按 **Asia/Shanghai** 时区判断“今天”，优先加载当天练习；尚未发布时明确提示并显示最近一篇已发布内容。
- 支持选择、填空、改写三种题型。答案默认折叠，展开后显示答案、解释和纠错。
- 每道题的回答、正误及知识点答题次数/错误次数保存在当前浏览器 `localStorage`。全部题目记录后可标记当日完成，历史列表显示完成状态。
- 清除学习记录需要浏览器二次确认。支持手机布局、键盘操作、浅色/深色模式。
- 日文汉字可在 JSON 中写成 `会社{かいしゃ}`，页面会生成 ruby 注音。只在日文内容里使用这个标记。
- 新生成的练习包含 4 道主题题和多道复习候选题。网页根据当前浏览器的知识点错误率选出 2 道复习题，并固定当天的选择；不上传个人答题记录。

学习记录不会跨设备同步。清理浏览器数据会删除进度。网站本身不会推送提醒。

## 项目结构

```text
index.html                页面结构
styles.css                响应式和深色模式样式
app.js                    加载、题型、答题和本地进度
adaptive.js               根据本地薄弱点选复习题
data/index.json           已发布日期索引
data/YYYY-MM-DD.json      每天一份练习
data/topics.json          自动生成的主题轮换表
scripts/validate-data.js  无依赖的 JSON 校验脚本
scripts/serve.js           本地静态预览服务器
scripts/generate-daily.js DeepSeek Flash 生成脚本
.github/workflows/validate.yml        提交时校验并部署 Pages
.github/workflows/generate-daily.yml  每日生成并部署 Pages
```

初始示例数据为 2026-09-21 至 2026-09-25，其中 23–25 日分别练习「はず・つもり」「と・たら」「しか～ない・だけ・は」。2026-09-26 的「から・ので」已通过自动流程生成。已有内容保留原样；新主题从初级到高级轮换。

## 本地预览与检查

在仓库根目录运行：

```bash
node scripts/validate-data.js
node --test scripts/*.test.js
node scripts/serve.js
```

打开 `http://127.0.0.1:8000/`；也可以打开 `http://127.0.0.1:8000/jlpt-n2-daily/` 测试 GitHub Pages 子路径。直接以 `file://` 打开时，浏览器通常不允许页面读取 JSON。

可在浏览器控制台执行 `localStorage.getItem('n2-progress-v2')` 查看保存的数据。这个存储名称沿用旧版，以保留已有答题记录。清除记录入口在左侧导航底部。

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
| `review_exercises` | 可选的自适应复习候选题；有此字段时 `exercises` 恰好 4 题，网页选 2 道复习题 |

题型字段：

| `type` | 额外字段 | 答案格式 |
| --- | --- | --- |
| `multiple_choice` | `jp`, `options` | `answer` 为从 0 开始的选项序号 |
| `fill_blank` | `jp`, `accepted_answers` | `answer` 为标准填词；允许的写法放在数组中 |
| `rewrite` | `source`, `accepted_answers` | `answer` 为标准改写句；允许的写法放在数组中 |

`explanation` 说明正确表达的语感；`correction` 说明错误项为何错误或不自然。复习旧知识点时在本期 `grammar_points` 添加相同的稳定 ID，再在 `review_points` 标出，并给相应题目标记该 ID。日文注音用 `漢字{かんじ}`，例如 `駅{えき}に着{つ}く`。

进度结构版本为 `2`，包含 `completedDates`、按日期和题目 ID 组织的 `attempts`、按知识点 ID 组织的 `grammarStats`（`attempts` 和 `errors`），以及当天固定的 `dailySelections`。旧版本 2 的记录可直接使用。复习题按 `(错误次数 + 1) / (答题次数 + 2)` 排序；没有记录时按日期稳定轮换。GitHub Actions 无法读取访问者浏览器里的数据，所以生成的是通用题库，个性化选择在浏览器内完成。

## 创建仓库并部署 GitHub Pages

1. 在 GitHub 新建公开仓库，例如 `jlpt-n2-daily`，无需额外生成 README。
2. 若当前目录尚未初始化 Git，在此运行 `git init -b main`。然后提交与推送：

   ```bash
   git add .
   git commit -m "Build daily Japanese practice site"
   git remote add origin https://github.com/<用户名>/<仓库名>.git
   git push -u origin main
   ```

   若已存在 Git 仓库和 `origin`，保留现有远端，直接提交和推送即可。
3. 在仓库 **Settings → Pages → Build and deployment**，将 **Source** 设为 **GitHub Actions**。推送到 `main` 后，`validate.yml` 先验证 JSON，再使用 GitHub 官方 Pages actions 部署。Pull request 只校验，不部署。
4. 在 **Actions** 查看 `Validate and deploy Pages` 是否成功；Pages 设置页会显示实际地址。项目站点通常为 `https://<用户名>.github.io/<仓库名>/`。

页面与 JSON 均使用 `./` 相对路径，兼容上述仓库子路径。若仓库之前使用 **Deploy from a branch**，请切换为 **GitHub Actions**，以便使用本工作流。参考 [GitHub 官方 Pages 工作流指南](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 每日自动生成与自适应复习

自动生成使用 DeepSeek 官方 `deepseek-flash` 模型的 Chat Completions JSON 模式。配置步骤：

1. 在 DeepSeek 官方平台创建 API Key。到仓库 **Settings → Secrets and variables → Actions → New repository secret**，名称填 `DEEPSEEK_API_KEY`，值填密钥。**不要把密钥写进代码、JSON、网页或聊天消息。**调用模型可能产生 API 费用。
2. 在 GitHub **Actions → Generate daily Japanese practice → Run workflow** 手动运行一次。当天已有练习会跳过；如要测试生成，请在日期输入框填入下一未发布的日期。
3. 查看运行日志及生成的 JSON。脚本会拒绝缺字段、缺复习候选题、无 ruby 注音等结构错误；生成内容仍建议人工阅读，尤其核对日语自然度与答案。校验失败时不会提交或发布。

工作流计划在每天 **Asia/Shanghai 18:15** 生成当天练习。GitHub 定时工作流可能延迟，不能保证恰好在 19:00 提醒前完成。若日期文件已存在，工作流会跳过，不覆盖手工编辑的练习；2026-09-26 起按 `data/topics.json` 轮换初级至高级的主题，难度随当天主题变化。可直接编辑该文件调整后续主题；已有日期的练习不会被覆盖。首次启用后留意 [GitHub Actions](https://github.com/KhaosZen/jlpt-n2-daily/actions) 的运行结果。

流程为：GitHub Actions 定时触发 → 调用 DeepSeek Flash → 生成当天 JSON 和索引 → 验证 → 提交 → **同一次工作流**部署 GitHub Pages。由 `GITHUB_TOKEN` 推送的提交不会再触发普通 `push` 工作流，因此生成工作流自行部署；参见 [GitHub Actions 触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。DeepSeek 的 [JSON 模式说明](https://api-docs.deepseek.com/guides/json_mode/)解释了 API 格式和空输出的可能性。

**当前自适应范围**是从每天已生成的复习候选题中，挑选适合当前浏览器的两题。生成脚本无法读取本地 `localStorage`，因此不会为某个人单独生成全套新题。若将来要让模型直接依据个人错题生成，须先设计主动且安全的进度同步方式。

职责分工：**GitHub Pages** 承载练习；**GitHub Actions** 发布每日内容；**ChatGPT Scheduled Task** 每天 19:00 提醒“今日の日本語練習が用意できました。”，未来可附上站点地址。网站本身不发送提醒。
