'use server'
import { getCategories } from '@/lib/api'
import { env } from '@/lib/env'
import { z } from "zod";
import { formatCategoryForAIPrompt } from '@/lib/utils'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { Currency } from 'lucide-react';
import { zodToJsonSchema } from "zod-to-json-schema";


export async function extractExpenseInformationFromImage(imageBase64: string, mimeType: string = "image/jpeg") {
  'use server'
  
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not defined')
  }

  const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })

  const categories = await getCategories()
  const categoriesList = categories.map((c) => formatCategoryForAIPrompt(c)).join(', ')

  const recipeItemSchema = z.object({
    name: z.string().optional().describe("Name of the item"),
    price: z.number().describe("Price of the item")
  });

  const recipeSchema = z.object({
    amount: z.number().optional().describe("Total amount of the receipt"),
    date: z.string().optional().describe("Date of the expense in YYYY-MM-DD format"),
    title: z.string().optional().describe("The merchant name or a brief title"),
    categoryId: z.number().optional().describe("The ID of the category from the provided list"),
    currency: z.string().optional().describe("The currency code (e.g. USD, EUR)"),
    items: z.array(recipeItemSchema).optional().describe("List of individual items purchased")
  });

  try {

    const prompt = `
      Analyze this receipt image. Extract the following information:
      - Total amount (number)
      - Date (YYYY-MM-DD)
      - Merchant name as Title
      - Currency Code (ISO 4217)
      - List of items with names and prices.
      - Guess the category ID from this list: ${categoriesList}. If unsure, use 0.
    `

    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: imageBase64
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(recipeSchema),
        thinkingConfig: {
         thinkingLevel: ThinkingLevel.MINIMAL,
        }
      },
    })

    const data = recipeSchema.parse(JSON.parse(response.text!));

    // Ensure we return a consistent structure even if the LLM omits optional fields
    return {
      amount: data?.amount,
      categoryId: data?.categoryId,
      date: data?.date,
      title: data?.title,
      currency: data?.currency,
      items: data?.items || []
    }
  } catch (error) {
    console.error('Error processing receipt with Gemini:', error)
    throw new Error('Failed to extract information from receipt')
  }
}

export type ReceiptExtractedInfo = Awaited<
  ReturnType<typeof extractExpenseInformationFromImage>
>