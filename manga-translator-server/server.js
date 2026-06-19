import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import OpenAI from 'openai';

const app = express();
const allowedModels = new Set([
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4o',
  'gpt-4o-mini'
]);
const textOnlyModels = new Set(['gpt-4', 'gpt-3.5-turbo']);
const defaultModel = 'gpt-5.4-mini';

app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_request, response) => {
  response.json({ ok: true });
});

app.post('/translate-image', async (request, response, next) => {
  const { imageBase64, apiKey, model = defaultModel } = request.body || {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return response.status(400).json({ error: 'imageBase64 is required' });
  }

  const resolvedApiKey =
    (typeof apiKey === 'string' && apiKey.trim()) ||
    process.env.OPENAI_API_KEY?.trim();
  if (!resolvedApiKey) {
    return response.status(400).json({ error: 'OpenAI API Key is required' });
  }

  if (!allowedModels.has(model)) {
    if (textOnlyModels.has(model)) {
      return response.status(400).json({
        error: `${model} 不支援圖片輸入，請改用 manga-ocr-service Python 後端`
      });
    }
    return response.status(400).json({ error: 'Unsupported OpenAI model' });
  }

  try {
    const openai = new OpenAI({ apiKey: resolvedApiKey });
    const openaiResponse = await openai.responses.create({
      model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                '你是日文漫畫翻譯助手。',
                '請辨識圖片中的日文文字，並翻譯成台灣正體中文。',
                '翻譯要自然、符合漫畫台詞語氣。',
                '如果看不清楚，請明確說「看不清楚」。',
                '只輸出翻譯後的中文，不要解釋。'
              ].join('\n')
            },
            {
              type: 'input_image',
              image_url: imageBase64
            }
          ]
        }
      ]
    });

    response.json({
      translatedText: openaiResponse.output_text?.trim() || ''
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({
    error: error?.message || 'OpenAI translation failed'
  });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, '0.0.0.0', () => {
  console.log(`Manga translator server listening on http://localhost:${port}`);
});
