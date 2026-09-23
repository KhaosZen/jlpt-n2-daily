# 每日 JLPT N2 日语语法练习

一个可发布到 GitHub Pages 的纯静态练习网站。页面与练习数据分开；每天新增一份 JSON，并更新索引，就能在同一网址看到新内容。

## 目前包含

- 最新一期练习与历史日期导航
- 语法要点、选择题、答案及解析折叠
- 答错后自动加入复习；也可以手动加入或移除
- 移动端布局；无需构建工具或第三方依赖

当前附带 2026-09-21 至 2026-09-23 的三份**示例练习**。首页的“今日练习”始终指向 `data/index.json` 的第一条，即最新已发布内容。错题保存在访问者当前浏览器的 `localStorage`，换设备或清除浏览器数据后不会同步。

## 文件结构

```text
index.html             页面结构
styles.css             样式
app.js                 加载、答题和错题逻辑
data/index.json        按日期从新到旧排列的练习索引
data/YYYY-MM-DD.json   每日练习内容
```

## 本地预览

由于浏览器通常不允许从 `file://` 页面读取 JSON，请在项目目录启动一个静态服务器：

```bash
python -m http.server 8000
```

然后打开 `http://localhost:8000/`。也可以使用 VS Code Live Server 等静态服务器。

## 发布到 GitHub Pages

1. 在 GitHub 新建一个仓库，例如 `jlpt-n2-daily`。将本目录的**所有文件及文件夹**放到仓库根目录，提交并推送到 `main` 分支。
2. 打开仓库 **Settings → Pages**。在 **Build and deployment** 下，将 **Source** 设为 **Deploy from a branch**，分支选 `main`，目录选 `/(root)`，保存。
3. 等待 Pages 完成发布。项目仓库的网址通常是 `https://<用户名>.github.io/<仓库名>/`；实际网址以 Pages 设置页显示的为准。

本站使用相对路径，因此也适用于项目仓库的子路径。GitHub Pages 的[分支发布设置说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)提供了最新操作步骤。

## 手动增加一天的内容

1. 复制一份 `data/YYYY-MM-DD.json`，以新日期命名，修改日期、主题、要点、题目和解析。
2. 每道题的 `id` 在**当天文件内**保持唯一；`answer` 是从 **0** 开始的选项序号。检查日文、正确答案和解析是否一致。
3. 在 `data/index.json` 的 `lessons` 数组**最前面**加入 `{ "date": "YYYY-MM-DD", "title": "主题" }`。
4. 提交并推送。站点更新后，最新一期会自动出现在“今日练习”。

当前题型是单选题。可以在当日的 `tags`、题目的 `tag` 和 `takeawayNote` 中标记旧知识点，在新练习里插入复习题。复习队列记录访问者做错的题，适合回看；它本身不会生成新题。

## 后续接入每天 19:00 自动生成

目前**没有启用自动生成或定时发布**。要实现它，可按下面的顺序扩展：

1. 编写一个内容生成脚本：选择当天的助词或 N2 核心语法主题，参考旧题的易错点，生成 `data/YYYY-MM-DD.json`，并把日期放到 `data/index.json` 首位。脚本必须校验 JSON 结构、选项序号、日期以及日文和解析。建议先输出候选内容供人工审核，再开放自动发布。
2. 在仓库新增 GitHub Actions 定时工作流，设置 `on.schedule` 在 `Asia/Singapore` 的 `19:00` 运行，并保留 `workflow_dispatch` 供手动触发。生成脚本需要的 API 密钥放在仓库 **Settings → Secrets and variables → Actions**，不要写进前端或提交到仓库。
3. 让工作流提交新 JSON 后**显式部署 Pages**，或改用可触发 Pages 构建的发布方式。GitHub 文档指出，使用工作流自带的 `GITHUB_TOKEN` 提交到分支，**不会触发**按分支发布的 Pages 构建，因此只做自动提交不足以保证网页更新。
4. 运行一次手动触发，核对输出内容、工作流日志和页面显示后，再启用日程。

GitHub Actions 的[定时语法和时区说明](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)与[Pages 发布说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)可供配置时核对。定时工作流可能延迟执行，因此“19:00”应理解为计划启动时间，而非网站保证秒级更新的时间。
