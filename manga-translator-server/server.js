import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import OpenAI from 'openai';

const app = Fastify({ logger: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

await app.register(cors, {
  origin: true
});

app.get('/health', async () => ({ ok: true }));

app.post('/translate-image', async (request, reply) => {
  const { imageBase64 } = request.body || {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return reply.code(400).send({ error: 'imageBase64 is required' });
  }

  const response = await openai.responses.create({
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

  return {
    translatedText: response.output_text?.trim() || ''
  };
});

const port = Number(process.env.PORT || 8787);
app.listen({ port, host: '0.0.0.0' });
