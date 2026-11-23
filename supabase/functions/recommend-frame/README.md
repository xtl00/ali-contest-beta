# AI 画面识别与阵容推荐接口

接口为 `POST /functions/v1/recommend-frame`。每次只处理一帧，使用服务端鉴权。当前网页仍使用浏览器里的 OCR。接入公网网页时，应由同站服务端代理承接并按会话限流，服务端密钥不可放入网页。

| 请求字段 | 说明 |
| --- | --- |
| `source` | `datatft` 或 `dataj` |
| `season`, `version` | 当前接入 `18` 和 `18.7` |
| `mode` | `scan` 返回观察结果，`final` 最多返回一个阵容方向 |
| `stageHint` | 可选，浏览器读到的阶段，比如 `2-1` |
| `openingComplete` | `final` 必须传 `true`，表示用户确认在 2-1 选完强化符文 |
| `chosenAugment` | 可选，用户确认的强化符文 ID 或名称 |
| `image` | `{ mediaType, data }`，JPEG、PNG 或 WebP，`data` 为不带 URL 前缀的 Base64 |

返回 `stage`、`stop`、`observations` 和 `direction`。接口读到 2-1 之后的阶段，或处理了用户确认的最后一帧，都会返回 `stop: true`。调用方收到后应停止采集。模型只返回识别结果，阵容名称由所选数据源的阵容库计算。画面信息不足时，`direction` 为 `null`。

## 设置与验证

- `TFT_VISION_GATEWAY_TOKEN` 用于服务间鉴权，通过 `Authorization: Bearer <token>` 发送。
- `OPENAI_API_KEY` 和 `TFT_VISION_MODEL` 用于 OpenAI 视觉模型。采用支持图像输入和结构化输出的模型。
- Supabase 部署使用自带的 `SUPABASE_URL` 和公开读取密钥。可用 `TFT_CATALOG_PUBLIC_KEY` 明确指定已有的只读公开密钥。
- 使用 `node --test supabase/functions/recommend-frame/handler.test.mjs` 运行模拟模型测试，不发起付费调用。

模型启用后，调用者提交的画面会发给所配置的模型供应商。网站正式接入前应取得画面发送授权，并以本地 OCR 作为回退。
