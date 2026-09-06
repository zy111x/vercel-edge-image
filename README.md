# Edge Image Studio

基于 **Vercel Edge + Photon WASM** 的图片处理服务，同时提供一个面向普通用户的可视化 Image Studio。

原项目的 URL 参数 API 仍然保留；现在也可以直接打开网站，通过 UI 完成图片导入、处理、预览和下载，不需要手工编写 `resize!830,400,2|...` 这样的操作字符串。

## 功能

### 可视化工作台

- 本地图片拖拽 / 选择上传
- 远程图片 URL 导入
- 图片缩放与采样方式选择
- 坐标裁剪与 1:1、4:3、16:9、3:4、9:16 快速比例
- 任意角度旋转、水平 / 垂直翻转
- Photon 预设滤镜
- 亮度、对比度调整
- 图片水印（本地文件或远程 URL）
- 文字水印
- WEBP / JPEG / PNG 输出与质量控制
- 多步骤管线组合、排序、删除、一次执行
- 原图 / 处理结果对比
- 结果下载
- URL 图片场景下自动生成兼容 API URL

### API

- 保留原有 GET 参数 API
- 新增结构化 POST API，UI 内部使用 JSON 管线，不需要手工处理 URL 编码
- 支持图片地址白名单
- GET 远程图片处理结果继续使用 CDN 长缓存
- POST / 本地文件处理结果使用 `no-store`

## 部署

```bash
npm i -g pnpm
pnpm install

mv .env.example .env
# WHITE_LIST 可填写允许访问的图片域名，逗号分隔；留空表示不限制

npm run deploy
```

部署后直接访问根域名即可进入 Image Studio。

## API 使用

### 兼容模式：GET

```text
/api?url=<ENCODED_IMAGE_URL>&action=resize!830,400,3|rotate!90&format=webp&quality=92
```

为了兼容旧版调用，当根路径存在 `url` 查询参数时，Vercel 路由会继续转发到图片 API；也可以使用 `/image` 作为更明确的图片处理入口。

参数：

- `url`: 原图 URL
- `action`: Photon 操作字符串，多个操作使用 `|` 连接
- `format`: `webp` / `jpg` / `jpeg` / `png`
- `quality`: 1-100

### 推荐模式：POST JSON

```json
{
  "url": "https://example.com/image.jpg",
  "pipeline": [
    { "action": "resize", "params": [1280, 720, 3] },
    { "action": "filter", "params": ["vintage"] },
    { "action": "rotate", "params": [90] }
  ],
  "format": "webp",
  "quality": 92
}
```

请求地址：`POST /api`

结构化管线更适合 UI、程序化调用和包含中文文本等复杂参数的场景。

### 本地文件

Image Studio 会使用 `multipart/form-data` 将本地文件发送到 `POST /api`，服务端处理完成后直接返回图片，不持久化保存原文件或结果文件。

> 本地上传受 Vercel 请求体大小等平台限制影响。超大图片更推荐使用远程 URL 模式。

## Photon

项目当前使用 `@silvia-odwyer/photon 0.3.2`。Photon 提供缩放、裁剪、旋转、滤镜、颜色调整、水印、混合等大量图像处理函数；API 仍保留动态 Photon action 能力，因此后续可以继续把更多高级操作接入 UI。

## License

Apache-2.0
