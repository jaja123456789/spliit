'use server'
import { getCategories } from '@/lib/api'
import { env } from '@/lib/env'
import { formatCategoryForAIPrompt } from '@/lib/utils'
import OpenAI from 'openai'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

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
  currency: z.string().optional().describe('The currency code (e.g. USD, EUR)'),
  items: z
    .array(recipeItemSchema)
    .optional()
    .describe('List of individual items purchased'),
})

export async function extractExpenseInformationFromImage(
  images: { base64: string; mimeType: string }[],
) {
  'use server'

  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not defined')
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

  try {
    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: env.OPENROUTER_API_KEY,
    })

    // Append schema instruction for OpenRouter
    const openAIPrompt = `${prompt} \n\nRespond strictly in valid JSON format matching this schema: ${JSON.stringify(
      zodToJsonSchema(recipeSchema),
    )}`

    const contentParts: any[] = [{ type: 'text', text: openAIPrompt }]

    images.forEach((img) => {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.mimeType};base64,${img.base64}`,
        },
      })
    })

    const completion = await openai.chat.completions.create({
      model: env.OPENROUTER_RECEIPT_MODEL,
      messages: [{ role: 'user', content: contentParts }],
      temperature: 0.2,
    })

    const rawContent = completion.choices[0]?.message?.content
    if (!rawContent) {
      throw new Error(
        'No content received from OpenRouter. The model may have timed out or blocked the request.',
      )
    }

    // Clean out <think> tags if the model still forces them through
    let cleanedContent = rawContent
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim()

    // Extract just the JSON block
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/)
    cleanedContent = jsonMatch ? jsonMatch[0] : cleanedContent

    const data = recipeSchema.parse(JSON.parse(cleanedContent))
    return normalizeResponse(data)
  } catch (error) {
    console.error('Error processing receipt with OpenRouter:', error)
    throw new Error('Failed to extract information from receipt')
  }
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
