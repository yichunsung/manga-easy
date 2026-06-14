import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import OpenAI from 'openai';

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_request, response) => {
  response.json({ ok: true });
});

app.post('/translate-image', async (request, response, next) => {
  const { imageBase64 } = request.body || {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return response.status(400).json({ error: 'imageBase64 is required' });
  }

  try {
    const openaiResponse = await openai.responses.create({
      model: 'gpt-4.1-mini',
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
