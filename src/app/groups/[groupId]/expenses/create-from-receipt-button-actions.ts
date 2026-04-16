'use server'
import { getCategories } from '@/lib/api'
import { env } from '@/lib/env'
import { formatCategoryForAIPrompt } from '@/lib/utils'
import OpenAI from 'openai'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

const recipeItemSchema = z.object({
  name: z.string().optional().describe('Name of the item'),
  quantity: z
    .number()
    .optional()
    .describe('Quantity of the item (default 1 if not shown)'),
  unitPrice: z
    .number()
    .nullish()
    .describe('Unit price of a single item before multiplying by quantity'),
  price: z
    .number()
    .describe(
      'Total price for this line (unitPrice * quantity). If only one price is shown, use it here.',
    ),
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
      You are a receipt parser. Carefully analyze the receipt image(s) and extract structured data.

      The images may represent:
      1. A complete receipt (possibly split across multiple photos — treat them as one receipt).
      2. A PARTIAL receipt (only some items visible, no total shown).

      ## Instructions

      ### Total Amount
      - Look for a line explicitly labeled "Total", "Grand Total", "Amount Due", or similar.
      - If this is a partial receipt or no total line is visible, return null. Do NOT sum up items to guess the total.

      ### Items
      Extract EVERY line item visible. For each item:
      - **name**: the product/item name as written on the receipt.
      - **quantity**: the number of units. Look for patterns like "2x", "Qty: 3", or a quantity column. Default to 1 if not shown.
      - **unitPrice**: the per-unit price, if shown separately (e.g., "2 x $3.50").
      - **price**: the TOTAL price for that line (unitPrice × quantity). If only one price is shown for the line, use it as-is.

      Examples:
      - "2x Coffee    $7.00"  → name: "Coffee", quantity: 2, unitPrice: 3.50, price: 7.00
      - "Orange Juice $4.50"  → name: "Orange Juice", quantity: 1, price: 4.50
      - "Burger  3  $12.00"   → name: "Burger", quantity: 3, unitPrice: 4.00, price: 12.00

      Do NOT collapse multiple identical items into one — keep each line as-is from the receipt.
      Do NOT skip items even if they look like discounts, taxes, or fees (unless they are the Total line).

      ### Other Fields
      - Date: format as YYYY-MM-DD. If not found, omit.
      - Merchant name: the store/restaurant name, usually at the top.
      - Currency: ISO 4217 code (e.g. USD, EUR, GBP). Infer from symbols if not written ($ → USD, € → EUR, £ → GBP).
      - Category: pick the best matching ID from this list: ${categoriesList}. If unsure, use 0.
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
  const expandedItems = (data?.items || []).flatMap((item) => {
    const qty = Math.max(1, Math.round(item.quantity ?? 1))
    const unitPrice =
      item.unitPrice ?? (qty > 1 ? item.price / qty : item.price)
    if (qty <= 1) {
      return [{ name: item.name, price: item.price }]
    }
    // Expand into individual line items, distributing rounding to the last item
    const basePrice = Math.round(unitPrice * 100) / 100
    const distributed = Array.from({ length: qty }, () => ({
      name: item.name,
      price: basePrice,
    }))
    // Fix any rounding difference on the last item
    const sumDiff =
      Math.round(item.price * 100) -
      distributed.reduce((acc, i) => acc + Math.round(i.price * 100), 0)
    if (sumDiff !== 0) {
      distributed[distributed.length - 1].price =
        Math.round(distributed[distributed.length - 1].price * 100 + sumDiff) /
        100
    }
    return distributed
  })

  return {
    amount: data?.amount,
    categoryId: data?.categoryId,
    date: data?.date,
    title: data?.title,
    currency: data?.currency,
    items: expandedItems,
  }
}

export type ReceiptExtractedInfo = Awaited<
  ReturnType<typeof extractExpenseInformationFromImage>
>
