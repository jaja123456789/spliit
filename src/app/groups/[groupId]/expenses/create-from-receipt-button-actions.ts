'use server'
import { getCategories } from '@/lib/api'
import { env } from '@/lib/env'
import { z } from 'zod'
import { formatCategoryForAIPrompt } from '@/lib/utils'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { zodToJsonSchema } from 'zod-to-json-schema'
import OpenAI from 'openai'

const recipeItemSchema = z.object({
  name: z.string().optional().describe('Name of the item'),
  price: z.number().describe('Price of the item'),
})

const recipeSchema = z.object({
  amount: z.number().optional().describe('Total amount of the receipt'),
  date: z
    .string()
    .optional()
    .describe('Date of the expense in YYYY-MM-DD format'),
  title: z.string().optional().describe('The merchant name or a brief title'),
  categoryId: z
    .number()
    .optional()
    .describe('The ID of the category from the provided list'),
  currency: z
    .string()
    .optional()
    .describe('The currency code (e.g. USD, EUR)'),
  items: z
    .array(recipeItemSchema)
    .optional()
    .describe('List of individual items purchased'),
})

export async function extractExpenseInformationFromImage(
  images: { base64: string; mimeType: string }[],
) {
  'use server'

  if (!env.GEMINI_API_KEY && !env.OPENAI_API_KEY) {
    throw new Error('Neither GEMINI_API_KEY nor OPENAI_API_KEY is defined')
  }

  const categories = await getCategories()
  const categoriesList = categories
    .map((c) => formatCategoryForAIPrompt(c))
    .join(', ')

  const prompt = `
      Analyze these images of a receipt.
      
      NOTE: The images might represent:
      1. A complete receipt (potentially split across multiple photos).
      2. A PARTIAL receipt (e.g., just a photo of a few items at the bottom).

      Extract the following information:
      - Total amount: Look for a distinct "Total" line. If this is a PARTIAL receipt and no total is visible, return 0 or null. DO NOT guess the total by summing items if the image looks incomplete.
      - Date (YYYY-MM-DD)
      - Merchant name as Title
      - Currency Code (ISO 4217)
      - List of items with names and prices. Catch as many as visible.
      - Guess the category ID from this list: ${categoriesList}. If unsure, use 0.
    `

  // 1. Priority: Gemini
  if (env.GEMINI_API_KEY) {
    try {
      const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
      const imageParts = images.map((img) => ({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64,
        },
      }))

      const response = await client.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }, ...imageParts],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: zodToJsonSchema(recipeSchema),
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL
          }
        },
      })

      const data = recipeSchema.parse(JSON.parse(response.text!))
      return normalizeResponse(data)
    } catch (error) {
      console.error('Error processing receipt with Gemini:', error)
      if (!env.OPENAI_API_KEY) throw error
    }
  }

  // 2. Fallback: OpenAI
  if (env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

      const contentParts: any[] = [{ type: 'text', text: prompt }]

      images.forEach((img) => {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${img.mimeType};base64,${img.base64}`,
          },
        })
      })

      // Append schema instruction for OpenAI (since we use generic JSON mode here)
      const openAIPrompt = `${prompt} \n\n Respond in JSON format matching this schema: ${JSON.stringify(
        zodToJsonSchema(recipeSchema),
      )}`
      contentParts[0].text = openAIPrompt

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: contentParts }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      })

      const rawContent = completion.choices[0].message.content
      if (!rawContent) throw new Error('No content received from OpenAI')

      const data = recipeSchema.parse(JSON.parse(rawContent))
      return normalizeResponse(data)
    } catch (error) {
      console.error('Error processing receipt with OpenAI:', error)
      throw new Error('Failed to extract information from receipt')
    }
  }

  throw new Error('No AI provider available')
}

function normalizeResponse(data: z.infer<typeof recipeSchema>) {
  return {
    amount: data?.amount,
    categoryId: data?.categoryId,
    date: data?.date,
    title: data?.title,
    currency: data?.currency,
    items: data?.items || [],
  }
}

export type ReceiptExtractedInfo = Awaited<
  ReturnType<typeof extractExpenseInformationFromImage>
>